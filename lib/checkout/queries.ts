import "server-only";

import { cache } from "react";
import * as z from "zod";

import { requireUser } from "@/lib/auth/dal";
import { minorFromDatabase, minorToUsdDecimal } from "@/lib/payments/money";
import { createClient } from "@/lib/supabase/server";

import { deriveCheckoutPaymentView, type CheckoutPaymentView } from "./payment-view";

// Customer-scoped reads of checkout sessions / payment attempts, through the
// customer's own client: RLS (checkout_sessions_select_own_or_admin,
// payments_select_own_or_admin) limits every row to the signed-in customer,
// and the explicit user_id filters below are the usual defense in depth.

export type ActiveCheckout = { id: string; reservedUntil: string };

// The customer's payment-in-progress checkout, if any (at most one exists —
// enforced by the database).
export const getOwnActiveCheckout = cache(async (): Promise<ActiveCheckout | null> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkout_sessions")
    .select("id, reserved_until")
    .eq("user_id", user.id)
    .eq("status", "awaiting_payment")
    .maybeSingle();
  if (error) {
    console.error("getOwnActiveCheckout: failed to load", error.code);
    throw new Error("Failed to load checkout");
  }
  return data ? { id: data.id, reservedUntil: data.reserved_until } : null;
});

export type CheckoutStatusItem = { name: string; quantity: number; lineTotal: string };

export type OwnCheckoutStatus = {
  id: string;
  view: CheckoutPaymentView;
  // Exact USD decimal string from integer cents (no float math).
  total: string;
  items: CheckoutStatusItem[];
  // Safe display only (e.g. "Visa •••• 1005"); never provider identifiers.
  paymentMethod: { brand?: string; last4?: string } | null;
};

const idSchema = z.uuid();

export const getOwnCheckoutStatus = cache(async (checkoutSessionId: string): Promise<OwnCheckoutStatus | null> => {
  const user = await requireUser();
  if (!idSchema.safeParse(checkoutSessionId).success) return null;

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("checkout_sessions")
    .select("id, status, order_id, reserved_until, amount_minor, currency")
    .eq("id", checkoutSessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getOwnCheckoutStatus: failed to load session", error.code);
    throw new Error("Failed to load checkout");
  }
  if (!session) return null;

  const [{ data: items, error: itemsError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase
      .from("checkout_session_items")
      .select("product_name, quantity, subtotal")
      .eq("checkout_session_id", session.id)
      .order("product_name"),
    supabase
      .from("payments")
      .select("status, display_summary, created_at")
      .eq("checkout_session_id", session.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (itemsError || paymentsError) {
    console.error("getOwnCheckoutStatus: failed to load details", (itemsError ?? paymentsError)?.code);
    throw new Error("Failed to load checkout");
  }

  const latest = payments?.[0] ?? null;
  const summary = (latest?.display_summary ?? null) as { brand?: string; last4?: string } | null;
  return {
    id: session.id,
    view: deriveCheckoutPaymentView(session, latest?.status ?? null),
    total: minorToUsdDecimal(minorFromDatabase(session.amount_minor)),
    items: (items ?? []).map((item) => ({ name: item.product_name, quantity: item.quantity, lineTotal: String(item.subtotal) })),
    paymentMethod: summary && (summary.brand || summary.last4) ? { brand: summary.brand, last4: summary.last4 } : null,
  };
});
