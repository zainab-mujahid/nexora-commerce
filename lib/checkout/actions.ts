"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { isPaymentError, type PaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getPaymentAvailability } from "@/lib/payments/presentation";
import { getActivePaymentProvider } from "@/lib/payments/registry";
import { getPaymentService } from "@/lib/payments/service";
import { getProviderReturnUrls } from "@/lib/payments/server/app-url";
import { createClient } from "@/lib/supabase/server";

import { startPaymentSchema, type CheckoutActionState, type PaymentActionState } from "./schemas";

// Customer checkout = online payment first, order second:
//   begin_checkout (stock reserved, cart kept) -> payment attempt -> the
//   provider's hosted page. The order is created only after the provider
//   confirms payment (return route / webhook -> authoritative verification).
// Every action re-checks the session (Server Actions are reachable by direct
// POST) and acts only through the customer's own Supabase client plus the
// server-side payment service. Nothing payment-related from the browser is
// trusted beyond the address id and the idempotency key.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const GENERIC = "We couldn't start your payment. Please try again.";
const UNAVAILABLE = "Online payment isn't available right now. Please try again later.";

const statusPath = (checkoutSessionId: string) => `/checkout/payment/${checkoutSessionId}`;

async function productName(supabase: SupabaseServerClient, productId: string | undefined): Promise<string> {
  if (productId) {
    const { data } = await supabase.from("products").select("name").eq("id", productId).maybeSingle();
    if (data?.name) return data.name;
  }
  return "An item in your cart";
}

// begin_checkout refusals -> messages a customer can act on.
async function describeCheckoutError(supabase: SupabaseServerClient, error: PaymentError): Promise<string> {
  switch (error.details.dbCode) {
    case "ADDRESS_NOT_FOUND":
      return "Select a valid shipping address.";
    case "CART_EMPTY":
      return "Your cart is empty.";
    case "PRODUCT_UNAVAILABLE":
      return `${await productName(supabase, error.details.entityId)} is no longer available. Please update your cart.`;
    case "INSUFFICIENT_STOCK":
      return `${await productName(supabase, error.details.entityId)} no longer has enough stock available. Please update the quantity in your cart.`;
    case "INVALID_TOTAL":
      return "This order total can't be paid online.";
    default:
      return GENERIC;
  }
}

function providerUrls() {
  return getProviderReturnUrls(getActivePaymentProvider().name);
}

export async function startSecurePayment(
  _prevState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  await requireUser();

  const parsed = startPaymentSchema.safeParse({
    addressId: formData.get("addressId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: "Select a shipping address." };
  if (!getPaymentAvailability().available) return { error: UNAVAILABLE };

  const supabase = await createClient();
  const outcome = await reserveAndLink(supabase, parsed.data);
  if ("error" in outcome) return { error: outcome.error };
  redirect(outcome.destination);
}

// Returns where to send the browser next, or a customer-facing error.
async function reserveAndLink(
  supabase: SupabaseServerClient,
  input: { addressId: string; idempotencyKey: string },
): Promise<{ destination: string } | { error: string }> {
  const service = getPaymentService();

  // 1. Reserve stock into a checkout session (idempotent per key).
  let checkoutSessionId: string;
  try {
    const started = await service.startCheckout(supabase, input);
    // A replayed key for a checkout that already finished: show its status.
    if (started.status !== "awaiting_payment") return { destination: statusPath(started.checkoutSessionId) };
    checkoutSessionId = started.checkoutSessionId;
  } catch (error) {
    // One payment-in-progress checkout per customer: continue that one.
    if (isPaymentError(error) && error.details.dbCode === "CHECKOUT_IN_PROGRESS" && error.details.entityId) {
      return { destination: statusPath(error.details.entityId) };
    }
    if (isPaymentError(error) && error.code === "checkout_rejected") {
      return { error: await describeCheckoutError(supabase, error) };
    }
    logPaymentEvent("error", "checkout_start_failed", { code: isPaymentError(error) ? error.code : "unknown" });
    return { error: GENERIC };
  }

  // 2. Payment attempt + hosted checkout link. If the provider can't be
  // reached, the reservation stays and the status page offers a retry.
  revalidatePath("/cart");
  try {
    const checkout = await service.createProviderCheckout(supabase, { checkoutSessionId, ...providerUrls() });
    return { destination: checkout.redirectUrl };
  } catch (error) {
    logPaymentEvent("warn", "checkout_provider_link_failed", { checkoutSessionId, code: isPaymentError(error) ? error.code : "unknown" });
    return { destination: `${statusPath(checkoutSessionId)}?notice=unavailable` };
  }
}

// Resume (or start) the provider payment for the customer's open checkout.
export async function resumeSecurePayment(
  checkoutSessionId: string,
  _prevState: PaymentActionState,
  _formData: FormData,
): Promise<PaymentActionState> {
  void _prevState;
  void _formData;
  await requireUser();
  if (!getPaymentAvailability().available) return { error: UNAVAILABLE };

  let destination: string;
  try {
    const supabase = await createClient();
    const checkout = await getPaymentService().createProviderCheckout(supabase, { checkoutSessionId, ...providerUrls() });
    destination = checkout.redirectUrl;
  } catch (error) {
    const dbCode = isPaymentError(error) ? error.details.dbCode : undefined;
    logPaymentEvent("warn", "checkout_resume_failed", { checkoutSessionId, code: isPaymentError(error) ? error.code : "unknown", dbCode });
    if (dbCode === "RESERVATION_EXPIRED") return { error: "This checkout has expired. Start a new checkout from your cart." };
    if (dbCode === "CHECKOUT_SESSION_NOT_PAYABLE" || dbCode === "SAFEPAY_TRACKER_NOT_RESUMABLE") {
      redirect(statusPath(checkoutSessionId));
    }
    return { error: "We couldn't reach the secure payment page. Please try again in a moment." };
  }
  redirect(destination);
}

// Stop the checkout: the provider is asked first; stock is released only if
// nothing can have been paid. The cart is never touched.
export async function cancelCheckout(
  checkoutSessionId: string,
  _prevState: PaymentActionState,
  _formData: FormData,
): Promise<PaymentActionState> {
  void _prevState;
  void _formData;
  await requireUser();

  let destination: string;
  try {
    const supabase = await createClient();
    const result = await getPaymentService().cancelCheckout(supabase, { checkoutSessionId });
    if (result.kind === "still_processing") {
      return { notice: "Your bank is still processing this payment, so it can't be cancelled yet. Check again in a minute." };
    }
    destination = result.kind === "finalized" ? `/orders/${result.orderId}?placed=1` : statusPath(checkoutSessionId);
  } catch (error) {
    logPaymentEvent("warn", "checkout_cancel_failed", { checkoutSessionId, code: isPaymentError(error) ? error.code : "unknown" });
    return { error: "We couldn't confirm the payment status, so nothing was cancelled. Please try again shortly." };
  }
  revalidatePath("/cart");
  redirect(destination);
}

// Re-check the payment with the provider (status page). Never trusts the
// browser's view of what happened.
export async function checkPaymentAgain(
  checkoutSessionId: string,
  _prevState: PaymentActionState,
  _formData: FormData,
): Promise<PaymentActionState> {
  void _prevState;
  void _formData;
  await requireUser();

  let orderId: string | null = null;
  try {
    const supabase = await createClient();
    const result = await getPaymentService().refreshCheckout(supabase, { checkoutSessionId });
    if (result.kind === "finalized") orderId = result.orderId;
  } catch (error) {
    logPaymentEvent("warn", "checkout_refresh_failed", { checkoutSessionId, code: isPaymentError(error) ? error.code : "unknown" });
    return { error: "We couldn't reach the payment provider. Please try again in a moment." };
  }
  if (orderId) {
    revalidatePath("/cart");
    redirect(`/orders/${orderId}?placed=1`);
  }
  revalidatePath(statusPath(checkoutSessionId));
  return { notice: "checked" };
}
