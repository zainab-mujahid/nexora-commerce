import "server-only";

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import * as z from "zod";

import { isPaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getPaymentServiceForProvider } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";

// Shared handler for the browser coming back from a provider's hosted page
// (/payments/<provider>/return and /cancel).
//
// The query string is UNSIGNED (Safepay appends only ?order_id=&tracker=), so
// it is a hint naming which payment to look at — nothing more:
//   - the payment must belong to the signed-in customer (RLS + user_id);
//   - the order_id hint must match that payment's internal reference;
//   - the state shown afterwards comes from an authoritative provider lookup
//     (verifyPayment), which alone can finalize an order — idempotently, so
//     refreshing this URL or racing the webhook never creates a second one.
// A cancel redirect never releases stock: it shows the payment page, where a
// still-open payment can be resumed or deliberately cancelled.

const PROVIDER_PAYMENT_ID: Record<string, RegExp> = { safepay: /^track_[0-9a-f-]{36}$/ };

const UNKNOWN = "/checkout/payment/unknown";

export async function handleProviderRedirect(
  request: NextRequest,
  provider: "safepay",
  kind: "return" | "cancel",
): Promise<never> {
  const params = request.nextUrl.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const providerPaymentId = params.get("tracker") ?? "";
  const reference = params.get("order_id");
  if (!PROVIDER_PAYMENT_ID[provider].test(providerPaymentId) || (reference !== null && !z.uuid().safeParse(reference).success)) {
    logPaymentEvent("warn", "provider_redirect_malformed", { provider, outcome: kind });
    redirect(UNKNOWN);
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, checkout_session_id")
    .eq("provider", provider)
    .eq("provider_payment_id", providerPaymentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !payment || (reference !== null && reference !== payment.id)) {
    logPaymentEvent("warn", "provider_redirect_unmatched", { provider, outcome: kind });
    redirect(UNKNOWN);
  }

  const statusPage = `/checkout/payment/${payment.checkout_session_id}`;
  let destination = kind === "cancel" ? `${statusPage}?from=cancel` : statusPage;
  try {
    const result = await getPaymentServiceForProvider(provider).verifyPayment({ paymentId: payment.id });
    if (result.kind === "finalized") destination = `/orders/${result.orderId}?placed=1`;
  } catch (verifyError) {
    logPaymentEvent("warn", "provider_redirect_verify_failed", {
      provider,
      paymentId: payment.id,
      outcome: kind,
      code: isPaymentError(verifyError) ? verifyError.code : "unknown",
    });
    destination = `${statusPage}?notice=verify`;
  }
  redirect(destination);
}
