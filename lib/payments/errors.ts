// Generic payment error model. A PaymentError's message is always a fixed,
// safe sentence chosen here — never a provider response, a database error
// text, a secret or a header. The underlying error (if any) is kept only as a
// non-enumerable `cause` for server-side debugging and is excluded from JSON.

export type PaymentErrorCode =
  | "configuration" //            missing/invalid server configuration
  | "invalid_input" //            caller supplied something unusable
  | "not_found" //                checkout session / payment does not exist
  | "checkout_rejected" //        begin_checkout refused (cart, stock, address…)
  | "conflict" //                 state/idempotency conflict
  | "database" //                 unexpected database failure
  | "invariant" //                data violates an expected invariant
  | "provider_unavailable" //     provider could not be reached / errored
  | "provider_malformed_response" // provider answered with unusable data
  | "verification_mismatch" //    authoritative lookup disagrees with Nexora
  | "payment_not_completed" //    payment is not paid (yet)
  | "requires_review" //          needs manual review; no order created
  | "reconciliation_required"; // provider succeeded but Nexora could not record it

const SAFE_MESSAGES: Record<PaymentErrorCode, string> = {
  configuration: "Payments are not configured correctly.",
  invalid_input: "The payment request is invalid.",
  not_found: "The checkout or payment could not be found.",
  checkout_rejected: "The checkout could not be started.",
  conflict: "The payment is in a state that does not allow this operation.",
  database: "A payment database operation failed.",
  invariant: "Payment data failed an integrity check.",
  provider_unavailable: "The payment provider is unavailable.",
  provider_malformed_response: "The payment provider returned an unexpected response.",
  verification_mismatch: "The payment could not be verified.",
  payment_not_completed: "The payment has not been completed.",
  requires_review: "The payment requires manual review.",
  reconciliation_required: "The payment needs to be reconciled before continuing.",
};

// Only identifiers and closed-set codes — safe to log and safe to keep on an
// error object. Never amounts entered by a user, emails, names or payloads.
export type PaymentErrorDetails = {
  // Stable machine code raised by a database payment function (e.g.
  // 'CHECKOUT_IN_PROGRESS', 'INSUFFICIENT_STOCK'), when one applies.
  dbCode?: string;
  // The id carried by that database code (a product or checkout session id).
  entityId?: string;
  paymentId?: string;
  checkoutSessionId?: string;
  provider?: string;
  providerPaymentId?: string;
  issues?: readonly string[];
};

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly details: PaymentErrorDetails;

  constructor(code: PaymentErrorCode, details: PaymentErrorDetails = {}, options?: { cause?: unknown }) {
    super(SAFE_MESSAGES[code]);
    this.name = "PaymentError";
    this.code = code;
    this.details = Object.freeze({ ...details });
    // Kept out of enumeration and JSON so it can never be serialized into a
    // response or a log line by accident.
    Object.defineProperty(this, "cause", { value: options?.cause, enumerable: false, writable: false });
    Object.setPrototypeOf(this, PaymentError.prototype);
  }

  toJSON(): { name: string; code: PaymentErrorCode; message: string; details: PaymentErrorDetails } {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

export function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}
