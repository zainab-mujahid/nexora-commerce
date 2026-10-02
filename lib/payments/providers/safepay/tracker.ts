import * as z from "zod";

import { PaymentError } from "../../errors";
import type { PaymentDisplaySummary, PaymentStatus, ProviderState, VerifiedProviderPayment } from "../../types";

// Safepay "tracker" (one payment session) as returned by the authoritative
// lookup GET /reporter/api/v1/payments/{tracker}, and its normalization into
// the generic VerifiedProviderPayment. Pure — no I/O — so it is unit-tested
// against recorded sandbox responses.
//
// Shape verified against Safepay sandbox responses (v1 and v2 of the
// reporter API return the same structure): { ok, data: { token, environment,
// state, mode, metadata.order_id.value, client.api_key, purchase_totals:
// { quote_amount, base_amount, conversion_rate }, charge?, attempts? } }.
// Only the fields needed for verification and safe display are parsed; the
// rest is ignored and never logged.

// Safepay amounts are integers in the currency's lowest denomination.
const amount = z.object({ currency: z.string(), amount: z.number().int().nonnegative() });

const paymentMethod = z
  .object({
    last_four: z.string().optional(),
    scheme: z.string().optional(),
    card_type: z.string().optional(),
    kind: z.string().optional(),
  })
  .partial()
  .optional();

export const trackerSchema = z.object({
  token: z.string().regex(/^track_[0-9a-f-]{36}$/),
  environment: z.string(),
  state: z.string(),
  mode: z.string().optional(),
  metadata: z
    .record(z.string(), z.object({ value: z.string() }).partial().passthrough())
    .nullish(),
  client: z.object({ api_key: z.string() }).partial().passthrough().nullish(),
  purchase_totals: z.object({
    quote_amount: amount,
    base_amount: amount.optional(),
  }),
  charge: z.object({ amount: amount.optional() }).partial().passthrough().nullish(),
  attempts: z
    .array(
      z
        .object({ is_success: z.boolean().optional(), payment_method: paymentMethod })
        .partial()
        .passthrough(),
    )
    .nullish(),
});

export const lookupResponseSchema = z.object({ ok: z.literal(true).optional(), data: trackerSchema });

export type SafepayTracker = z.infer<typeof trackerSchema>;

// Tracker state -> generic status. TRACKER_ENDED is the ONLY state that can
// become "paid" (Safepay: "The tracker has been paid"). States that return or
// contest money after capture go to manual review. Anything unknown is a
// malformed response (fail closed), never a guess.
//
// Only STARTED, ENDED (and declined attempts on an open tracker) have been
// observed in the sandbox. REFUNDED / PARTIAL_REFUND / REVERSED / VOIDED /
// DISPUTED come from Safepay's documented state list and cannot be produced
// without a destructive provider operation, so they are mapped conservatively:
// reversal/void/dispute never become a refund here — they go to review, with
// the specific state kept (REVIEW_STATES) for the admin.
const STATE_MAP: Readonly<Record<string, PaymentStatus>> = Object.freeze({
  TRACKER_STARTED: "pending",
  TRACKER_ENROLLED: "processing",
  TRACKER_AUTHORIZED: "processing",
  TRACKER_ENDED: "paid",
  TRACKER_CANCELLED: "cancelled",
  TRACKER_EXPIRED: "expired",
  TRACKER_REFUNDED: "refunded",
  TRACKER_PARTIAL_REFUND: "partially_refunded",
  TRACKER_REVERSED: "requires_review",
  TRACKER_VOIDED: "requires_review",
  TRACKER_DISPUTED: "requires_review",
});

// Review states: which one it was, in generic terms, plus the review code.
const REVIEW_STATES: Readonly<Record<string, { providerState: ProviderState; code: string }>> = Object.freeze({
  TRACKER_REVERSED: { providerState: "reversed", code: "PROVIDER_REVERSED" },
  TRACKER_VOIDED: { providerState: "voided", code: "PROVIDER_VOIDED" },
  TRACKER_DISPUTED: { providerState: "disputed", code: "PROVIDER_DISPUTED" },
});

export function mapTrackerState(state: string): PaymentStatus {
  if (!Object.hasOwn(STATE_MAP, state)) {
    throw new PaymentError("provider_malformed_response", { provider: "safepay", dbCode: "SAFEPAY_UNKNOWN_TRACKER_STATE" });
  }
  return STATE_MAP[state];
}

export function normalizeTracker(
  tracker: SafepayTracker,
  config: { apiKey: string; environment: "sandbox" },
): VerifiedProviderPayment {
  let status = mapTrackerState(tracker.state);

  // A declined attempt leaves the tracker open (the customer may retry on the
  // hosted page). Observed in the sandbox: declined attempts OMIT is_success
  // entirely (only the successful attempt carries is_success: true), so an
  // open tracker after declines normally stays pending/processing. "failed"
  // is used only if Safepay ever reports is_success: false explicitly —
  // never inferred from a missing field. Either way it is not paid.
  const lastAttempt = tracker.attempts?.at(-1);
  if ((status === "pending" || status === "processing") && lastAttempt?.is_success === false) status = "failed";

  // The amount the customer is charged, in the currency Nexora requested.
  // Safepay also reports its PKR settlement equivalent (base_amount) — never
  // used for verification.
  const quote = tracker.purchase_totals.quote_amount;

  // Once captured, the charge must agree with the totals — in the quote
  // currency it must equal the quote, in the base currency the base amount.
  const charged = tracker.charge?.amount;
  if (charged) {
    const base = tracker.purchase_totals.base_amount;
    const consistent =
      (charged.currency === quote.currency && charged.amount === quote.amount) ||
      (!!base && charged.currency === base.currency && charged.amount === base.amount);
    if (!consistent) {
      throw new PaymentError("provider_malformed_response", { provider: "safepay", dbCode: "SAFEPAY_CHARGE_TOTALS_INCONSISTENT" });
    }
  }

  const environment = tracker.environment === "sandbox" ? "sandbox" : "live";
  const review = Object.hasOwn(REVIEW_STATES, tracker.state) ? REVIEW_STATES[tracker.state] : null;
  return {
    provider: "safepay",
    providerPaymentId: tracker.token,
    reference: tracker.metadata?.order_id?.value ?? null,
    status,
    money: { currency: quote.currency, amountMinor: BigInt(quote.amount) },
    // Safepay reports "sandbox" or "production"; anything other than sandbox
    // is treated as live, which verification rejects for a sandbox adapter.
    environment,
    accountMatches: tracker.client?.api_key === config.apiKey,
    display: displayFrom(lastAttempt?.payment_method, environment),
    ...(review ? { providerState: review.providerState, failureCode: review.code } : {}),
  };
}

function displayFrom(method: z.infer<typeof paymentMethod>, environment: string): PaymentDisplaySummary | undefined {
  if (!method) return undefined;
  const brand = method.scheme ?? method.card_type;
  const out: PaymentDisplaySummary = {};
  if (brand && /^[A-Za-z][A-Za-z ]{0,30}$/.test(brand)) out.brand = brand;
  if (method.last_four && /^[0-9]{4}$/.test(method.last_four)) out.last4 = method.last_four;
  if (method.kind && /^[A-Za-z_]{1,20}$/.test(method.kind)) out.method = method.kind.toLowerCase();
  out.environment = environment;
  return Object.keys(out).length > 1 ? out : undefined;
}
