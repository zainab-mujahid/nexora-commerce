import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PaymentError, type PaymentErrorCode } from "../errors";
import { minorFromDatabase, STORE_CURRENCY, usd, type Money } from "../money";
import {
  isCheckoutStatus,
  isPaymentStatus,
  type CheckoutStatus,
  type PaymentDisplaySummary,
  type PaymentProviderName,
  type PaymentStatus,
} from "../types";

// Typed access to the Payments P1 database interface. Every write goes
// through a P1 SECURITY DEFINER function; the only direct reads are of the
// payment tables themselves (payments, checkout_sessions), which is all the
// secret key may read. Nothing here reads orders/products/profiles/addresses.

export type PaymentContext = {
  paymentId: string;
  checkoutSessionId: string;
  userId: string;
  provider: PaymentProviderName;
  providerPaymentId: string | null;
  money: Money;
  status: PaymentStatus;
  orderId: string | null;
  session: {
    status: CheckoutStatus;
    money: Money;
    orderId: string | null;
    reservedUntil: string;
  };
};

export type PaymentAttempt = {
  paymentId: string;
  money: Money;
  status: PaymentStatus;
  providerPaymentId: string | null;
  reused: boolean;
};

export type FinalizeOutcome = "created" | "already_finalized" | "duplicate_payment" | "rejected" | "payment_conflict";

export type RecordStatusInput = {
  paymentId: string;
  status: PaymentStatus;
  // Required when status is 'paid': the amount/currency the provider lookup
  // verified. The database re-checks them against the stored payment.
  verified?: { currency: string; amountMinor: bigint };
  failureCode?: string;
  failureMessage?: string;
  display?: PaymentDisplaySummary;
};

export type EventOutcome = "processed" | "ignored" | "verification_failed" | "error";

// Allow-listed metadata accepted by payment_events.details (mirrors
// payment_event_details_is_valid in the database).
export type PaymentEventDetails = Partial<
  Record<
    | "reason" | "code" | "category" | "message" | "environment" | "provider_state" | "provider_event_type"
    | "http_status" | "attempt" | "reference" | "amount_minor" | "currency" | "account_matches"
    | "expected_reference" | "received_reference" | "expected_amount_minor" | "received_amount_minor"
    | "expected_currency" | "received_currency" | "expected_provider_payment_id" | "received_provider_payment_id",
    string | number | boolean | null
  >
>;

export interface PaymentStore {
  createPaymentAttempt(checkoutSessionId: string, provider: PaymentProviderName): Promise<PaymentAttempt>;
  attachProviderPayment(paymentId: string, provider: PaymentProviderName, providerPaymentId: string): Promise<void>;
  getPaymentContext(
    lookup: { paymentId: string } | { provider: PaymentProviderName; providerPaymentId: string },
  ): Promise<PaymentContext | null>;
  recordPaymentStatus(input: RecordStatusInput): Promise<PaymentStatus>;
  finalizePaidCheckout(paymentId: string): Promise<{ orderId: string | null; outcome: FinalizeOutcome }>;
  recordPaymentEvent(input: {
    provider: PaymentProviderName;
    providerEventId: string;
    eventType: string;
    signatureValid: boolean;
    paymentId?: string | null;
    details?: PaymentEventDetails;
  }): Promise<{ eventId: string; duplicate: boolean }>;
  markPaymentEventProcessed(input: {
    eventId: string;
    outcome: EventOutcome;
    paymentId?: string | null;
    details?: PaymentEventDetails;
  }): Promise<void>;
}

// ---- database error -> PaymentError ---------------------------------------
// P1 functions raise 'CODE' or 'CODE:<id>'. Only that machine code (and the
// id) is kept; the database message text itself is never surfaced.
const DB_CODE_MAP: Record<string, PaymentErrorCode> = {
  AUTH_REQUIRED: "invalid_input",
  IDEMPOTENCY_KEY_REQUIRED: "invalid_input",
  ADDRESS_NOT_FOUND: "checkout_rejected",
  CART_EMPTY: "checkout_rejected",
  PRODUCT_UNAVAILABLE: "checkout_rejected",
  INSUFFICIENT_STOCK: "checkout_rejected",
  INVALID_TOTAL: "checkout_rejected",
  CHECKOUT_IN_PROGRESS: "conflict",
  INVALID_PROVIDER: "invalid_input",
  CHECKOUT_SESSION_NOT_FOUND: "not_found",
  CHECKOUT_SESSION_NOT_PAYABLE: "conflict",
  RESERVATION_EXPIRED: "conflict",
  OPEN_ATTEMPT_OTHER_PROVIDER: "conflict",
  INVALID_PROVIDER_PAYMENT_ID: "invalid_input",
  PAYMENT_NOT_FOUND: "not_found",
  PROVIDER_MISMATCH: "conflict",
  PROVIDER_PAYMENT_ALREADY_BOUND: "conflict",
  PAYMENT_NOT_BINDABLE: "conflict",
  PROVIDER_PAYMENT_ID_IN_USE: "conflict",
  INVALID_PAYMENT_STATUS: "invalid_input",
  ILLEGAL_PAYMENT_TRANSITION: "conflict",
  PAYMENT_NOT_BOUND: "conflict",
  VERIFICATION_REQUIRED: "invalid_input",
  PAYMENT_NOT_PAID: "payment_not_completed",
  CHECKOUT_SESSION_NOT_FINALIZABLE: "conflict",
  SIGNATURE_RESULT_REQUIRED: "invalid_input",
  INVALID_EVENT_OUTCOME: "invalid_input",
  PAYMENT_EVENT_NOT_FOUND: "not_found",
};

type DbError = { message?: string; code?: string };

export function toPaymentError(error: DbError, context: { paymentId?: string; checkoutSessionId?: string } = {}): PaymentError {
  const match = /^([A-Z][A-Z_]+)(?::(.*))?$/.exec(error.message ?? "");
  if (match && Object.hasOwn(DB_CODE_MAP, match[1])) {
    return new PaymentError(DB_CODE_MAP[match[1]], { dbCode: match[1], entityId: match[2] || undefined, ...context }, { cause: error });
  }
  // Permission/constraint/connection problems are unexpected for correct
  // server code; report them generically.
  return new PaymentError("database", { ...context }, { cause: error });
}

// ---- row parsing ------------------------------------------------------------
function asUsd(amountMinor: unknown, currency: unknown): Money {
  if (currency !== STORE_CURRENCY) throw new PaymentError("invariant", { dbCode: "UNEXPECTED_CURRENCY" });
  try {
    return usd(minorFromDatabase(amountMinor));
  } catch (cause) {
    throw new PaymentError("invariant", { dbCode: "UNEXPECTED_AMOUNT" }, { cause });
  }
}

function asPaymentStatus(value: unknown): PaymentStatus {
  if (!isPaymentStatus(value)) throw new PaymentError("invariant", { dbCode: "UNEXPECTED_PAYMENT_STATUS" });
  return value;
}

const PAYMENT_COLUMNS = "id, checkout_session_id, user_id, provider, provider_payment_id, amount_minor, currency, status, order_id";
const SESSION_COLUMNS = "id, user_id, status, amount_minor, currency, order_id, reserved_until";

export function createSupabasePaymentStore(admin: SupabaseClient): PaymentStore {
  return {
    async createPaymentAttempt(checkoutSessionId, provider) {
      const { data, error } = await admin.rpc("create_payment_attempt", {
        p_checkout_session_id: checkoutSessionId,
        p_provider: provider,
      });
      if (error) throw toPaymentError(error, { checkoutSessionId });
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) throw new PaymentError("invariant", { checkoutSessionId, dbCode: "NO_ATTEMPT_RETURNED" });
      return {
        paymentId: row.payment_id,
        money: asUsd(row.amount_minor, row.currency),
        status: asPaymentStatus(row.payment_status),
        providerPaymentId: row.provider_payment_id ?? null,
        reused: row.reused === true,
      };
    },

    async attachProviderPayment(paymentId, provider, providerPaymentId) {
      const { error } = await admin.rpc("attach_provider_payment", {
        p_payment_id: paymentId,
        p_provider: provider,
        p_provider_payment_id: providerPaymentId,
      });
      if (error) throw toPaymentError(error, { paymentId });
    },

    async getPaymentContext(lookup) {
      let query = admin.from("payments").select(PAYMENT_COLUMNS);
      query = "paymentId" in lookup
        ? query.eq("id", lookup.paymentId)
        : query.eq("provider", lookup.provider).eq("provider_payment_id", lookup.providerPaymentId);
      const { data: payment, error } = await query.maybeSingle();
      if (error) throw toPaymentError(error, "paymentId" in lookup ? { paymentId: lookup.paymentId } : {});
      if (!payment) return null;

      const { data: session, error: sessionError } = await admin
        .from("checkout_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", payment.checkout_session_id)
        .maybeSingle();
      if (sessionError) throw toPaymentError(sessionError, { paymentId: payment.id });
      if (!session || session.user_id !== payment.user_id || !isCheckoutStatus(session.status)) {
        throw new PaymentError("invariant", { paymentId: payment.id, dbCode: "SESSION_RELATIONSHIP_INVALID" });
      }

      return {
        paymentId: payment.id,
        checkoutSessionId: payment.checkout_session_id,
        userId: payment.user_id,
        provider: payment.provider,
        providerPaymentId: payment.provider_payment_id ?? null,
        money: asUsd(payment.amount_minor, payment.currency),
        status: asPaymentStatus(payment.status),
        orderId: payment.order_id ?? null,
        session: {
          status: session.status,
          money: asUsd(session.amount_minor, session.currency),
          orderId: session.order_id ?? null,
          reservedUntil: session.reserved_until,
        },
      };
    },

    async recordPaymentStatus(input) {
      const { data, error } = await admin.rpc("record_payment_status", {
        p_payment_id: input.paymentId,
        p_status: input.status,
        // bigint travels as a digit string (never a float) and is cast by
        // the database to bigint.
        p_verified_amount_minor: input.verified ? input.verified.amountMinor.toString() : null,
        p_verified_currency: input.verified ? input.verified.currency : null,
        p_failure_code: input.failureCode ?? null,
        p_failure_message: input.failureMessage ?? null,
        p_display_summary: input.display ?? null,
      });
      if (error) throw toPaymentError(error, { paymentId: input.paymentId });
      return asPaymentStatus(data);
    },

    async finalizePaidCheckout(paymentId) {
      const { data, error } = await admin.rpc("finalize_paid_checkout", { p_payment_id: paymentId });
      if (error) throw toPaymentError(error, { paymentId });
      const row = Array.isArray(data) ? data[0] : null;
      const outcomes: readonly string[] = ["created", "already_finalized", "duplicate_payment", "rejected", "payment_conflict"];
      if (!row || !outcomes.includes(row.outcome)) {
        throw new PaymentError("invariant", { paymentId, dbCode: "UNEXPECTED_FINALIZE_OUTCOME" });
      }
      return { orderId: row.order_id ?? null, outcome: row.outcome as FinalizeOutcome };
    },

    async recordPaymentEvent(input) {
      const { data, error } = await admin.rpc("record_payment_event", {
        p_provider: input.provider,
        p_provider_event_id: input.providerEventId,
        p_event_type: input.eventType,
        p_signature_valid: input.signatureValid,
        p_payment_id: input.paymentId ?? null,
        p_details: input.details ?? {},
      });
      if (error) throw toPaymentError(error);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.event_id) throw new PaymentError("invariant", { dbCode: "NO_EVENT_RETURNED" });
      return { eventId: row.event_id, duplicate: row.duplicate === true };
    },

    async markPaymentEventProcessed(input) {
      const { error } = await admin.rpc("mark_payment_event_processed", {
        p_event_id: input.eventId,
        p_outcome: input.outcome,
        p_payment_id: input.paymentId ?? null,
        p_details: input.details ?? null,
      });
      if (error) throw toPaymentError(error);
    },
  };
}

// ---- customer-scoped -------------------------------------------------------
// begin_checkout() runs with the CUSTOMER's own session (the cookie-based
// client from lib/supabase/server.ts in the app): the database derives the
// customer from auth.uid(), checks address ownership, prices the cart from the
// database and reserves stock. The secret key is not allowed to call it.
export type StartedCheckout = {
  checkoutSessionId: string;
  status: CheckoutStatus;
  money: Money;
  reservedUntil: string;
  reused: boolean;
};

export async function beginCheckoutAsCustomer(
  customerDb: SupabaseClient,
  input: { addressId: string; idempotencyKey: string },
): Promise<StartedCheckout> {
  const { data, error } = await customerDb.rpc("begin_checkout", {
    p_address_id: input.addressId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toPaymentError(error);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !isCheckoutStatus(row.session_status)) {
    throw new PaymentError("invariant", { dbCode: "NO_CHECKOUT_RETURNED" });
  }
  return {
    checkoutSessionId: row.checkout_session_id,
    status: row.session_status,
    money: asUsd(row.amount_minor, row.currency),
    reservedUntil: row.reserved_until,
    reused: row.reused === true,
  };
}
