import type { Money } from "./money";
import type { PaymentEnvironment, PaymentProviderName, PaymentReference, VerifiedProviderPayment } from "./types";

// The authoritative payment acceptance rule, as a pure function (no I/O) so
// it can be tested exhaustively. A payment is accepted as paid ONLY when the
// provider's authoritative lookup agrees with what Nexora stored on every
// security-critical field AND reports the payment as paid for the exact
// expected USD amount. Anything else is either "not paid yet" or a
// mismatch that must go to manual review — never an automatic correction.

export type ExpectedPayment = {
  provider: PaymentProviderName;
  // The provider payment id bound to this attempt by attach_provider_payment().
  providerPaymentId: string;
  // payments.id — the reference sent to the provider.
  reference: PaymentReference;
  // The environment the active adapter is configured for.
  environment: PaymentEnvironment;
  // payments.amount_minor / currency, copied from the checkout session.
  money: Money;
};

// Closed set of reasons; also used as payments.failure_code values.
export type VerificationIssue =
  | "PROVIDER_MISMATCH"
  | "PROVIDER_PAYMENT_ID_MISMATCH"
  | "REFERENCE_MISMATCH"
  | "ACCOUNT_MISMATCH"
  | "ENVIRONMENT_MISMATCH"
  | "AMOUNT_MISSING"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_MISMATCH";

export type VerificationDecision =
  // Identity checks passed, provider says paid, exact amount and currency.
  | { kind: "accept_paid" }
  // Identity checks passed; the provider reports a non-paid state. No order.
  | { kind: "not_paid" }
  // Something security-critical disagrees. No order; manual review.
  | { kind: "reject"; issues: readonly VerificationIssue[] };

export function evaluateProviderPayment(
  expected: ExpectedPayment,
  verified: VerifiedProviderPayment,
): VerificationDecision {
  const issues: VerificationIssue[] = [];

  // Identity: the lookup must be about THIS attempt, from THIS provider,
  // account and environment — whatever its status.
  if (verified.provider !== expected.provider) issues.push("PROVIDER_MISMATCH");
  if (verified.providerPaymentId !== expected.providerPaymentId) issues.push("PROVIDER_PAYMENT_ID_MISMATCH");
  if (verified.reference !== expected.reference) issues.push("REFERENCE_MISMATCH");
  if (verified.accountMatches !== true) issues.push("ACCOUNT_MISMATCH");
  if (verified.environment !== expected.environment) issues.push("ENVIRONMENT_MISMATCH");

  if (issues.length > 0) return { kind: "reject", issues };
  if (verified.status !== "paid") return { kind: "not_paid" };

  // Money: exact currency and exact integer minor units. No tolerance, no
  // rounding, no conversion.
  if (!verified.money) return { kind: "reject", issues: ["AMOUNT_MISSING"] };
  if (verified.money.currency !== expected.money.currency) issues.push("CURRENCY_MISMATCH");
  if (typeof verified.money.amountMinor !== "bigint" || verified.money.amountMinor !== expected.money.amountMinor) {
    issues.push("AMOUNT_MISMATCH");
  }
  return issues.length > 0 ? { kind: "reject", issues } : { kind: "accept_paid" };
}
