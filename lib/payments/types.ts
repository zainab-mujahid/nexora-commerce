import type { Money } from "./money";

// Provider-neutral payment vocabulary. These mirror the CHECK constraints of
// the payment tables in supabase/schema.sql (Payments P1) exactly; a provider
// adapter maps its own states onto them and nothing provider-specific (tracker
// states, endpoints, headers) appears here.

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "requires_review",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Money has been received (and possibly partly/fully returned).
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = ["paid", "partially_refunded", "refunded"];
// Still open at the provider: the customer may yet complete it.
export const UNSETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = ["pending", "processing", "failed"];

export const CHECKOUT_STATUSES = [
  "awaiting_payment",
  "completed",
  "expired",
  "cancelled",
  "payment_conflict",
] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

// What the provider itself reports about a payment (Payments P6), recorded on
// payments.provider_state after each authoritative lookup. Finer than the
// generic status: reversed/voided/disputed all become the generic
// 'requires_review', but support needs to know which one it was. Mirrors the
// payments_provider_state_check constraint in supabase/schema.sql.
export const PROVIDER_STATES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "reversed",
  "voided",
  "disputed",
  "review",
] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export function isProviderState(value: unknown): value is ProviderState {
  return typeof value === "string" && (PROVIDER_STATES as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isCheckoutStatus(value: unknown): value is CheckoutStatus {
  return typeof value === "string" && (CHECKOUT_STATUSES as readonly string[]).includes(value);
}

// Provider slug stored in payments.provider ('safepay', later e.g. 'stripe').
// Same format the database enforces.
export type PaymentProviderName = string;
export const PROVIDER_NAME_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export type PaymentEnvironment = "sandbox" | "live";

// Nexora's reference for one payment attempt: the payments.id UUID. It is
// the ONLY value sent to a provider for reconciliation (opaque — no email,
// name, address or product data), and it maps back to exactly one attempt.
export type PaymentReference = string;

// Safe, allow-listed display data (mirrors payment_display_summary_is_valid
// in the database). Never a full card number, CVV or provider payload.
export type PaymentDisplaySummary = {
  brand?: string;
  last4?: string;
  method?: string;
  environment?: string;
};

// The amount as the provider reported it. Currency stays a plain string
// because it is provider-reported data that verification has to check, not a
// value Nexora already trusts.
export type ProviderMoney = {
  readonly currency: string;
  readonly amountMinor: bigint;
};

// Result of an AUTHORITATIVE server-to-server lookup at the provider, already
// normalized by the adapter. Only this — never a redirect, query string or
// webhook body — can lead to an order.
export type VerifiedProviderPayment = {
  provider: PaymentProviderName;
  providerPaymentId: string;
  // The reference Nexora sent when the payment was created, as the provider
  // reports it back (null if the provider returned none).
  reference: PaymentReference | null;
  status: PaymentStatus;
  // Captured/charged amount; null when the provider has none to report yet.
  money: ProviderMoney | null;
  environment: PaymentEnvironment;
  // The payment belongs to the merchant account this deployment is
  // configured for (the adapter compares the provider's account identifier).
  accountMatches: boolean;
  display?: PaymentDisplaySummary;
  // The provider's own state in generic terms, when it is finer than
  // `status` (e.g. status 'requires_review' + providerState 'disputed').
  // Omitted -> derived from `status`.
  providerState?: ProviderState;
  // Short provider code / safe message for audit and support. Adapters must
  // keep these free of secrets and raw payloads.
  providerStatusCode?: string;
  failureCode?: string;
  failureMessage?: string;
};

export type CreateProviderCheckoutInput = {
  reference: PaymentReference;
  // Authoritative amount from the checkout session in the database.
  money: Money;
  returnUrl: string;
  cancelUrl: string;
  // Set when this attempt is already bound to a provider payment: the
  // adapter must resume that payment (e.g. issue a fresh hosted-checkout
  // link) and must NOT create a new one.
  existingProviderPaymentId: string | null;
};

export type CreateProviderCheckoutResult = {
  providerPaymentId: string;
  // Where the customer completes payment on the provider's hosted page.
  redirectUrl: string;
};

// An authentic provider event, reduced to a hint: which provider payment it
// concerns. It never carries a decision — the service re-fetches the payment
// from the provider before anything changes.
export type ProviderEventHint = {
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  reference: PaymentReference | null;
};

export type ParsedProviderEvent =
  | { authentic: true; hint: ProviderEventHint }
  | { authentic: false; reason: string; claimedEventId: string | null; claimedEventType: string | null };
