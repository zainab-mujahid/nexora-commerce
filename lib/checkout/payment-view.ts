// Customer-facing state of a checkout's payment, derived ONLY from database
// state (checkout session + latest payment attempt) — never from URL
// parameters or anything the browser reports. Pure, so every state is
// unit-testable.

export type CheckoutPaymentView =
  // Verified, finalized: the real order exists.
  | { kind: "confirmed"; orderId: string }
  // Reservation held; payment not attempted yet or the provider link was
  // never reached (e.g. temporary provider failure while preparing it).
  | { kind: "awaiting"; reservedUntil: string }
  // Customer is/was on the provider page; nothing captured yet. A declined
  // card also lands here: Safepay keeps the same checkout open for retries.
  | { kind: "pending"; reservedUntil: string }
  // The provider is mid-authorization (e.g. 3-D Secure). Re-check shortly.
  | { kind: "processing"; reservedUntil: string }
  // The provider explicitly reported a failed attempt; retry is possible.
  | { kind: "declined"; reservedUntil: string }
  // Hold time has passed but the reservation was not released yet.
  | { kind: "expired_pending" }
  | { kind: "cancelled" }
  | { kind: "expired" }
  // A payment needs manual review (mismatch, duplicate charge, late payment
  // with stock gone). No order was created automatically.
  | { kind: "review" };

export type CheckoutRow = {
  status: string;
  order_id: string | null;
  reserved_until: string;
};

export function deriveCheckoutPaymentView(
  session: CheckoutRow,
  latestPaymentStatus: string | null,
  now: number = Date.now(),
): CheckoutPaymentView {
  if (session.status === "completed" && session.order_id) return { kind: "confirmed", orderId: session.order_id };
  if (session.status === "payment_conflict") return { kind: "review" };
  if (session.status === "cancelled") return { kind: "cancelled" };
  if (session.status === "expired") return { kind: "expired" };

  // awaiting_payment
  if (latestPaymentStatus === "requires_review") return { kind: "review" };
  if (["paid", "partially_refunded", "refunded"].includes(latestPaymentStatus ?? "")) {
    // Paid but not finalized yet (verification in flight): treat as processing.
    return { kind: "processing", reservedUntil: session.reserved_until };
  }
  if (new Date(session.reserved_until).getTime() <= now) return { kind: "expired_pending" };
  const reservedUntil = session.reserved_until;
  switch (latestPaymentStatus) {
    case null:
      return { kind: "awaiting", reservedUntil };
    case "processing":
      return { kind: "processing", reservedUntil };
    case "failed":
      return { kind: "declined", reservedUntil };
    default:
      // pending, and closed attempts (cancelled/expired) on a still-open
      // reservation: the customer can (re)start payment.
      return { kind: "pending", reservedUntil };
  }
}
