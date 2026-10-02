// Display vocabulary for the admin payment-operations area (Payments P6).
// Pure: no data access. Everything here turns stored codes into calm,
// specific explanations — never a raw payload, a secret or a stack trace.

import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments/types";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  failed: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  requires_review: "Needs review",
};

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  pending: "badge",
  processing: "badge badge-info",
  paid: "badge badge-success",
  failed: "badge",
  cancelled: "badge",
  expired: "badge",
  refunded: "badge badge-info",
  partially_refunded: "badge badge-info",
  requires_review: "badge badge-warning",
};

export function paymentStatusLabel(status: string): string {
  return isKnownStatus(status) ? PAYMENT_STATUS_LABEL[status] : "Unknown";
}

export function paymentStatusBadgeClass(status: string): string {
  return isKnownStatus(status) ? PAYMENT_STATUS_BADGE[status] : "badge";
}

function isKnownStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

// What the provider itself last reported (payments.provider_state).
const PROVIDER_STATE_LABEL: Record<string, string> = {
  pending: "Not paid yet",
  processing: "Authorizing",
  paid: "Paid",
  failed: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  reversed: "Reversed",
  voided: "Voided",
  disputed: "Disputed",
  review: "Flagged for review",
};

export function providerStateLabel(state: string | null): string | null {
  if (!state) return null;
  return PROVIDER_STATE_LABEL[state] ?? "Unrecognized";
}

// Provider states that need someone's attention even when Nexora's own status
// does not say so on its own.
export const ATTENTION_PROVIDER_STATES = ["reversed", "voided", "disputed"] as const;

// Why a payment needs review, from payments.failure_code (closed set written
// by the payment service / database functions).
const REVIEW_REASONS: Record<string, { title: string; detail: string }> = {
  STOCK_UNAVAILABLE_AFTER_RELEASE: {
    title: "Paid after the reservation expired — items no longer available",
    detail:
      "The customer completed payment after the checkout's hold had ended and the stock had gone to other orders. No order was created. Decide whether the items can still be supplied, or return the money from the provider's dashboard.",
  },
  DUPLICATE_PAYMENT: {
    title: "Second payment for an already completed checkout",
    detail:
      "This checkout already produced an order from another payment, and this payment also succeeded. The customer was charged twice; the extra payment should be returned from the provider's dashboard.",
  },
  AMOUNT_MISMATCH: {
    title: "Paid amount differs from the checkout total",
    detail: "The provider confirmed a payment, but not for the exact amount Nexora expected. No order was created from it.",
  },
  CURRENCY_MISMATCH: {
    title: "Paid in an unexpected currency",
    detail: "The provider confirmed a payment in a different currency than the checkout's. No order was created from it.",
  },
  AMOUNT_MISSING: {
    title: "Provider reported no amount",
    detail: "The provider marked the payment as paid without reporting an amount, so it could not be verified.",
  },
  FINALIZE_INTEGRITY_MISMATCH: {
    title: "Payment doesn't match its checkout",
    detail: "The database's final consistency check failed for this payment. No order was created from it.",
  },
  PROVIDER_PAYMENT_ID_MISMATCH: {
    title: "Provider returned a different payment",
    detail: "The provider's lookup answered about a different payment than the one on record.",
  },
  REFERENCE_MISMATCH: {
    title: "Provider reference doesn't match",
    detail: "The provider reported a different Nexora reference for this payment.",
  },
  ACCOUNT_MISMATCH: {
    title: "Payment belongs to another merchant account",
    detail: "The provider reports this payment under a merchant account other than the one this store is configured for.",
  },
  ENVIRONMENT_MISMATCH: {
    title: "Test/live environment mismatch",
    detail: "The payment was found in a different provider environment than this store is configured for.",
  },
  PROVIDER_MISMATCH: {
    title: "Provider mismatch",
    detail: "The lookup came from a different payment provider than the one that created this payment.",
  },
  PROVIDER_DISPUTED: {
    title: "Disputed at the provider",
    detail:
      "The provider reports a dispute (chargeback) on this payment. Nothing was changed automatically — the order, its fulfilment and stock are as they were. Follow the dispute in the provider's dashboard.",
  },
  PROVIDER_REVERSED: {
    title: "Reversed at the provider",
    detail:
      "The provider reports this payment as reversed. Nothing was changed automatically — check in the provider's dashboard whether the money was returned before fulfilling the order.",
  },
  PROVIDER_VOIDED: {
    title: "Voided at the provider",
    detail:
      "The provider reports this payment as voided. Nothing was changed automatically — confirm in the provider's dashboard whether any money was captured before fulfilling the order.",
  },
  PROVIDER_REVIEW: {
    title: "Flagged by the provider",
    detail: "The provider reported a state that needs a manual check.",
  },
  PROVIDER_STATUS_REGRESSION: {
    title: "Provider no longer reports this payment as paid",
    detail: "Nexora recorded this payment as paid, but the provider now reports an earlier state. Nothing was downgraded automatically.",
  },
  UNEXPECTED_REFUND: {
    title: "Refund reported for a payment never recorded as paid",
    detail: "The provider reports a refund for a payment Nexora never saw as paid.",
  },
};

export function reviewReason(code: string | null): { title: string; detail: string } {
  if (code && Object.hasOwn(REVIEW_REASONS, code)) return REVIEW_REASONS[code];
  return {
    title: "Needs a manual check",
    detail: code
      ? `The payment service flagged this payment (${code}). Re-check it with the provider, then record what you decided.`
      : "The payment service flagged this payment for a manual check.",
  };
}

// Admin review resolutions (mirror the payment_review_notes CHECK).
export const REVIEW_RESOLUTIONS = [
  "acknowledged",
  "customer_contacted",
  "refund_handled_at_provider",
  "fulfilled_manually",
  "no_action_needed",
] as const;
export type ReviewResolution = (typeof REVIEW_RESOLUTIONS)[number];

export const REVIEW_RESOLUTION_LABEL: Record<ReviewResolution, string> = {
  acknowledged: "Acknowledged — looking into it",
  customer_contacted: "Customer contacted",
  refund_handled_at_provider: "Refund handled in the provider's dashboard",
  fulfilled_manually: "Fulfilled manually",
  no_action_needed: "No action needed",
};

export function resolutionLabel(value: string): string {
  return (REVIEW_RESOLUTIONS as readonly string[]).includes(value)
    ? REVIEW_RESOLUTION_LABEL[value as ReviewResolution]
    : "Note";
}

// Recorded event outcomes (payment_events.outcome).
const EVENT_OUTCOME_LABEL: Record<string, string> = {
  received: "Not processed yet",
  processed: "Processed",
  ignored: "Ignored — no matching payment",
  verification_failed: "Verification failed",
  rejected_signature: "Rejected — not authentic",
  error: "Processing failed",
};

export function eventOutcomeLabel(outcome: string): string {
  return EVENT_OUTCOME_LABEL[outcome] ?? "Unknown";
}

// Error categories stored on failed events (PaymentErrorCode values).
const EVENT_ERROR_LABEL: Record<string, string> = {
  provider_unavailable: "Provider couldn't be reached",
  provider_malformed_response: "Provider sent an unexpected response",
  configuration: "Provider not configured on this server",
  database: "Database operation failed",
  invariant: "Data integrity check failed",
  conflict: "Payment state conflict",
  not_found: "Payment not found",
};

export function eventErrorLabel(code: string | null): string | null {
  if (!code) return null;
  return EVENT_ERROR_LABEL[code] ?? "Processing error";
}

// Identifiers in lists: enough to recognize and search, not a dump.
export function shortRef(id: string): string {
  return id.slice(0, 8);
}

export function shortProviderId(id: string | null): string | null {
  if (!id) return null;
  const underscore = id.indexOf("_");
  const prefix = underscore > 0 && underscore < 12 ? id.slice(0, underscore + 1) : "";
  return id.length <= prefix.length + 10 ? id : `${prefix}…${id.slice(-8)}`;
}

// Integer minor units -> "$1,234.56". Display only; USD is the store currency.
export function formatMinor(amountMinor: string | number, currency: string): string {
  const minor = BigInt(String(amountMinor));
  const negative = minor < BigInt(0);
  const abs = negative ? -minor : minor;
  const hundred = BigInt(100);
  const whole = (abs / hundred).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (abs % hundred).toString().padStart(2, "0");
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${negative ? "-" : ""}${symbol}${whole}.${cents}`;
}

// ---- list views and paging (/admin/payments?view=&page=) ----

export const PAGE_SIZE = 20;
const MAX_PAGE = 500;

export const PAYMENT_VIEWS = [
  "attention",
  "conflicts",
  "disputes",
  "processing",
  "paid",
  "partially_refunded",
  "refunded",
  "all",
  "events",
] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export const PAYMENT_VIEW_LABEL: Record<PaymentView, string> = {
  attention: "Needs review",
  conflicts: "Payment conflicts",
  disputes: "Reversed · voided · disputed",
  processing: "Processing",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  all: "All payments",
  events: "Event recovery",
};

export function parseView(value: unknown): PaymentView {
  return typeof value === "string" && (PAYMENT_VIEWS as readonly string[]).includes(value) ? (value as PaymentView) : "attention";
}

export function parsePage(value: unknown): number {
  const n = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : 1;
  return Math.min(Math.max(n, 1), MAX_PAGE);
}

export type EventFilter = "exhausted" | "retrying";
export function parseEventFilter(value: unknown): EventFilter {
  return value === "retrying" ? "retrying" : "exhausted";
}
