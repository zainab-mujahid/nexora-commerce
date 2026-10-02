import type {
  CreateProviderCheckoutInput,
  CreateProviderCheckoutResult,
  CreateProviderRefundInput,
  ParsedProviderEvent,
  PaymentEnvironment,
  PaymentProviderName,
  PaymentReference,
  ProviderRefundAttempt,
  VerifiedProviderPayment,
} from "./types";

// The contract every payment provider adapter implements (Safepay in P3, a
// possible Stripe later). Everything provider-specific — endpoints, SDK
// calls, tokens, signature schemes, status names — stays inside the adapter;
// the payment service only ever sees these normalized types.
//
// Adapter rules:
//   - Never log or return secrets, auth headers, card data or raw payloads.
//   - Throw PaymentError('provider_unavailable') when the provider can't be
//     reached or returns an error, and
//     PaymentError('provider_malformed_response') when its answer can't be
//     normalized. Never guess a status or an amount.
export interface PaymentProvider {
  // Slug stored in payments.provider; must match the registry key.
  readonly name: PaymentProviderName;
  // Which provider environment this adapter is configured for. Verification
  // requires every looked-up payment to come from this same environment.
  readonly environment: PaymentEnvironment;

  // Create (or, when existingProviderPaymentId is set, resume) the provider
  // side of a payment for an amount the database already fixed, and return
  // where to send the customer. Must carry `reference` to the provider so the
  // payment can be reconciled to exactly one Nexora attempt.
  createCheckout(input: CreateProviderCheckoutInput): Promise<CreateProviderCheckoutResult>;

  // AUTHORITATIVE server-to-server lookup of one provider payment, normalized.
  // The only input that can lead to an order.
  fetchPayment(input: {
    providerPaymentId: string;
    reference: PaymentReference;
  }): Promise<VerifiedProviderPayment>;

  // Verify an incoming provider event (e.g. webhook signature) from the raw,
  // unparsed body and reduce it to a hint. An authentic event only tells the
  // service WHICH payment to re-fetch; it never decides anything itself.
  parseEvent(input: { rawBody: string; headers: Headers }): Promise<ParsedProviderEvent>;

  // Payments P7 (optional capability): send ONE refund request for an exact
  // amount. Called at most once per Nexora refund, never retried — if the
  // outcome is unknown, throw (see ProviderRefundAttempt) and the refund is
  // reconciled from fetchPayment()'s refund ledger instead. Adapters that
  // implement this must also report `refunds` from fetchPayment().
  createRefund?(input: CreateProviderRefundInput): Promise<ProviderRefundAttempt>;
}
