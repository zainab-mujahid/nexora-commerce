"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { placeOrderSchema, type CheckoutActionState } from "./schemas";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong placing your order. Please try again.";

// place_order() raises 'CODE' or 'CODE:<product_id>' (see supabase/schema.sql)
// so the client-visible message never needs to be more than that — this
// turns it into something a customer can act on. Falls back to the generic
// message for anything unrecognized (including a bare "AUTH_REQUIRED",
// which requireUser() above should make unreachable in practice).
async function describeError(
  supabase: SupabaseServerClient,
  rpcMessage: string,
): Promise<string> {
  const [code, productId] = rpcMessage.split(":");

  if (code === "ADDRESS_NOT_FOUND") {
    return "Select a valid shipping address.";
  }
  if (code === "CART_EMPTY") {
    return "Your cart is empty.";
  }
  if (code === "PRODUCT_UNAVAILABLE" || code === "INSUFFICIENT_STOCK") {
    let name = "An item in your cart";
    if (productId) {
      const { data } = await supabase
        .from("products")
        .select("name")
        .eq("id", productId)
        .maybeSingle();
      if (data?.name) name = data.name;
    }
    return code === "PRODUCT_UNAVAILABLE"
      ? `${name} is no longer available. Please update your cart.`
      : `${name} no longer has enough stock available. Please update the quantity in your cart.`;
  }

  return UNEXPECTED_ERROR_MESSAGE;
}

export async function placeOrder(
  _prevState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  // Server Actions are reachable by direct POST, not only through the
  // rendered form, so the session must be re-verified here.
  await requireUser();

  const parsed = placeOrderSchema.safeParse({
    addressId: formData.get("addressId"),
  });
  if (!parsed.success) {
    return { error: "Select a shipping address." };
  }

  const supabase = await createClient();

  // Every value this depends on — the caller's identity, address ownership,
  // cart contents, product availability/stock, and prices — is reloaded and
  // re-validated inside place_order() itself; nothing from the browser is
  // trusted beyond "which address id was picked". See supabase/schema.sql
  // for why this is a single atomic RPC rather than several client calls.
  const { data: orderId, error } = await supabase.rpc("place_order", {
    p_address_id: parsed.data.addressId,
  });

  if (error) {
    const message = await describeError(supabase, error.message);
    // Only log truly unexpected failures — the known validation outcomes
    // (empty cart, stale address, a product going unavailable/out of stock
    // between page load and submit) are expected, user-facing outcomes, not
    // application errors.
    if (message === UNEXPECTED_ERROR_MESSAGE) {
      console.error("placeOrder: place_order RPC failed", error);
    }
    return { error: message };
  }

  revalidatePath("/cart");
  // /orders/[id] (Step 17) is the same owner-scoped order-detail read this
  // used to have its own /checkout/confirmation/[orderId] page for —
  // ?placed=1 is only what tells that page to show the "thanks for your
  // order" banner on this one visit.
  redirect(`/orders/${orderId}?placed=1`);
}
