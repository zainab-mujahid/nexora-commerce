import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PaymentError, type PaymentErrorCode } from "../errors";
import { minorFromDatabase, minorToSafeInteger, STORE_CURRENCY, usd, type Money } from "../money";
import {
  isCheckoutStatus,
  isPaymentStatus,
  type CheckoutStatus,
  type PaymentDisplaySummary,
  type PaymentProviderName,
  isRefundStatus,
  type PaymentStatus,
  type ProviderRefundSnapshot,
  type ProviderState,
  type RefundReason,
  type RefundStatus,
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
  // When the provider's lookup first confirmed money was received.
  paidAt: string | null;
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
    | "expected_currency" | "received_currency" | "expected_provider_payment_id" | "received_provider_payment_id"
    | "provider_payment_id",
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
  // All payment attempts of one checkout session, oldest first.
  listSessionPayments(checkoutSessionId: string): Promise<SessionPayment[]>;
  // P1 release_checkout_session(): restores the reservation exactly once.
  // Only call after the provider confirmed nothing was paid.
  releaseCheckoutSession(checkoutSessionId: string, reason: "cancelled" | "expired"): Promise<string>;
  // Server-side read of one checkout session (no customer scoping — callers
  // must have authorized the access already, e.g. the reconciliation sweep).
  getCheckoutSession(checkoutSessionId: string): Promise<CheckoutSessionRow | null>;
  // P5 claims (bounded, skip-locked, leased): see supabase/schema.sql.
  claimExpiredCheckouts(limit: number): Promise<{ checkoutSessionId: string; attempts: number }[]>;
  claimRecoverableEvents(input: { limit: number; minAgeSeconds: number; maxAttempts: number }): Promise<RecoverableEvent[]>;
  // P6: what the provider reported in an authoritative lookup (observation
  // only; never changes payments.status).
  recordProviderState(paymentId: string, state: ProviderState): Promise<void>;
  // P6: claim ONE recorded authentic event for an admin-requested retry;
  // null when it is not claimable (processed, too fresh, in flight, ...).
  claimEventForRetry(eventId: string): Promise<RecoverableEvent | null>;
  // P7 refunds (see supabase/schema.sql, Payments P7).
  getRefund(refundId: string): Promise<RefundRow | null>;
  // What the provider answered to a refund request; never final on its own.
  recordRefundAttempt(input: RefundAttemptInput): Promise<RefundStatus>;
  // Apply one authoritative provider lookup to the refund ledger and derive
  // the payment's refund status from it (atomic, in the database).
  reconcileRefunds(input: {
    paymentId: string;
    providerStatus: PaymentStatus;
    snapshot: ProviderRefundSnapshot;
  }): Promise<RefundReconcileResult>;
  claimOpenRefunds(limit: number, maxAttempts: number): Promise<{ refundId: string; paymentId: string; provider: string; attempts: number }[]>;
}

export type RefundRow = {
  refundId: string;
  paymentId: string;
  provider: PaymentProviderName;
  providerRefundId: string | null;
  money: Money;
  status: RefundStatus;
  failureCode: string | null;
};

export type RefundAttemptInput =
  | { refundId: string; result: "accepted"; providerRefundId: string; amountMinor: bigint; currency: string }
  | { refundId: string; result: "rejected" | "uncertain"; code: string };

export type RefundReconcileResult = {
  paymentStatus: PaymentStatus;
  // Closed code when the provider's refund data disagreed with the ledger
  // (the payment then went to review), else null.
  issue: string | null;
  changed: number;
};

export type CheckoutSessionRow = {
  checkoutSessionId: string;
  userId: string;
  status: CheckoutStatus;
  orderId: string | null;
  reservedUntil: string;
};

// A recorded authentic event awaiting (re)processing — only identifiers that
// were stored when it was received; never raw request data.
export type RecoverableEvent = {
  eventId: string;
  provider: PaymentProviderName;
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  providerPaymentId: string | null;
  reference: string | null;
  attempts: number;
};

export type SessionPayment = {
  paymentId: string;
  provider: PaymentProviderName;
  providerPaymentId: string | null;
  status: PaymentStatus;
  orderId: string | null;
};

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
  INVALID_RELEASE_REASON: "invalid_input",
  INVALID_LIMIT: "invalid_input",
  INVALID_ARGUMENT: "invalid_input",
  RESERVATION_NOT_EXPIRED: "conflict",
  PAYMENT_ALREADY_SETTLED: "conflict",
  INVALID_PROVIDER_STATE: "invalid_input",
  // Payments P7 (refunds)
  ADMIN_REQUIRED: "invalid_input",
  INVALID_REFUND_AMOUNT: "invalid_input",
  INVALID_REFUND_REASON: "invalid_input",
  INVALID_NOTE: "invalid_input",
  IDEMPOTENCY_KEY_REUSED: "conflict",
  REFUND_NOT_ALLOWED: "conflict",
  REFUND_CURRENCY_MISMATCH: "invalid_input",
  REFUND_IN_PROGRESS: "conflict",
  REFUND_STATE_CHANGED: "conflict",
  REFUND_EXCEEDS_REMAINING: "invalid_input",
  REFUND_NOT_FOUND: "not_found",
  PROVIDER_REFUND_ID_IN_USE: "conflict",
  PAYMENT_NOT_SETTLED: "conflict",
  REFUND_HISTORY_IMMUTABLE: "invariant",
  ILLEGAL_REFUND_TRANSITION: "invariant",
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

const PAYMENT_COLUMNS = "id, checkout_session_id, user_id, provider, provider_payment_id, amount_minor, currency, status, order_id, paid_at";
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
        paidAt: payment.paid_at ?? null,
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

    async listSessionPayments(checkoutSessionId) {
      const { data, error } = await admin
        .from("payments")
        .select("id, provider, provider_payment_id, status, order_id, created_at")
        .eq("checkout_session_id", checkoutSessionId)
        .order("created_at", { ascending: true });
      if (error) throw toPaymentError(error, { checkoutSessionId });
      return (data ?? []).map((row) => ({
        paymentId: row.id,
        provider: row.provider,
        providerPaymentId: row.provider_payment_id ?? null,
        status: asPaymentStatus(row.status),
        orderId: row.order_id ?? null,
      }));
    },

    async getCheckoutSession(checkoutSessionId) {
      const { data, error } = await admin
        .from("checkout_sessions")
        .select("id, user_id, status, order_id, reserved_until")
        .eq("id", checkoutSessionId)
        .maybeSingle();
      if (error) throw toPaymentError(error, { checkoutSessionId });
      if (!data) return null;
      if (!isCheckoutStatus(data.status)) throw new PaymentError("invariant", { checkoutSessionId, dbCode: "UNEXPECTED_CHECKOUT_STATUS" });
      return {
        checkoutSessionId: data.id,
        userId: data.user_id,
        status: data.status,
        orderId: data.order_id ?? null,
        reservedUntil: data.reserved_until,
      };
    },

    async claimExpiredCheckouts(limit) {
      const { data, error } = await admin.rpc("claim_expired_checkouts", { p_limit: limit });
      if (error) throw toPaymentError(error);
      return (Array.isArray(data) ? data : []).map((row) => ({
        checkoutSessionId: row.checkout_session_id,
        attempts: Number(row.reconcile_attempts),
      }));
    },

    async claimRecoverableEvents({ limit, minAgeSeconds, maxAttempts }) {
      const { data, error } = await admin.rpc("claim_recoverable_payment_events", {
        p_limit: limit,
        p_min_age: `${Math.max(0, Math.floor(minAgeSeconds))} seconds`,
        p_max_attempts: maxAttempts,
      });
      if (error) throw toPaymentError(error);
      return (Array.isArray(data) ? data : []).map(recoverableEventFromRow);
    },

    async recordProviderState(paymentId, state) {
      const { error } = await admin.rpc("record_provider_state", { p_payment_id: paymentId, p_state: state });
      if (error) throw toPaymentError(error, { paymentId });
    },

    async claimEventForRetry(eventId) {
      const { data, error } = await admin.rpc("claim_payment_event_for_retry", { p_event_id: eventId });
      if (error) throw toPaymentError(error);
      const row = Array.isArray(data) ? data[0] : null;
      return row ? recoverableEventFromRow(row) : null;
    },

    async getRefund(refundId) {
      const { data, error } = await admin
        .from("payment_refunds")
        .select("id, payment_id, provider, provider_refund_id, amount_minor, currency, status, failure_code")
        .eq("id", refundId)
        .maybeSingle();
      if (error) throw toPaymentError(error);
      return data ? refundFromRow(data) : null;
    },

    async recordRefundAttempt(input) {
      const accepted = input.result === "accepted" ? input : null;
      const { data, error } = await admin.rpc("record_refund_attempt", {
        p_refund_id: input.refundId,
        p_result: input.result,
        p_provider_refund_id: accepted?.providerRefundId ?? null,
        // bigint as a digit string, cast by the database (never a float).
        p_amount_minor: accepted ? accepted.amountMinor.toString() : null,
        p_currency: accepted?.currency ?? null,
        p_code: input.result === "accepted" ? null : input.code,
      });
      if (error) throw toPaymentError(error);
      if (!isRefundStatus(data)) throw new PaymentError("invariant", { dbCode: "UNEXPECTED_REFUND_STATUS" });
      return data;
    },

    async reconcileRefunds({ paymentId, providerStatus, snapshot }) {
      const { data, error } = await admin.rpc("reconcile_payment_refunds", {
        p_payment_id: paymentId,
        p_provider_status: providerStatus,
        p_captured_minor: snapshot.captured ? snapshot.captured.amountMinor.toString() : null,
        p_remaining_minor: snapshot.remaining ? snapshot.remaining.amountMinor.toString() : null,
        // amount_minor as a JSON number: provider amounts were parsed as safe
        // integers by the adapter; the database re-validates every element.
        p_refunds: snapshot.refunds.map((r) => ({
          id: r.providerRefundId,
          amount_minor: minorToSafeInteger(r.money.amountMinor),
          currency: r.money.currency,
          voided: r.voided,
        })),
      });
      if (error) throw toPaymentError(error, { paymentId });
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) throw new PaymentError("invariant", { paymentId, dbCode: "NO_RECONCILE_RESULT" });
      return { paymentStatus: asPaymentStatus(row.payment_status), issue: row.issue ?? null, changed: Number(row.changed) };
    },

    async claimOpenRefunds(limit, maxAttempts) {
      const { data, error } = await admin.rpc("claim_open_refunds", { p_limit: limit, p_max_attempts: maxAttempts });
      if (error) throw toPaymentError(error);
      return (Array.isArray(data) ? data : []).map((row) => ({
        refundId: row.refund_id,
        paymentId: row.payment_id,
        provider: row.provider,
        attempts: Number(row.reconcile_attempts),
      }));
    },

    async releaseCheckoutSession(checkoutSessionId, reason) {
      const { data, error } = await admin.rpc("release_checkout_session", {
        p_checkout_session_id: checkoutSessionId,
        p_reason: reason,
      });
      if (error) throw toPaymentError(error, { checkoutSessionId });
      if (typeof data !== "string") throw new PaymentError("invariant", { checkoutSessionId, dbCode: "UNEXPECTED_RELEASE_RESULT" });
      return data;
    },
  };
}

// Only identifiers recorded with the event at receipt (see
// receiveProviderEvent); never raw request data.
function recoverableEventFromRow(row: {
  event_id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payment_id: string | null;
  details: unknown;
  process_attempts: number | string;
}): RecoverableEvent {
  const details = (row.details ?? {}) as Record<string, unknown>;
  return {
    eventId: row.event_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    paymentId: row.payment_id ?? null,
    providerPaymentId: typeof details.provider_payment_id === "string" ? details.provider_payment_id : null,
    reference: typeof details.reference === "string" ? details.reference : null,
    attempts: Number(row.process_attempts),
  };
}

function refundFromRow(row: {
  id: string;
  payment_id: string;
  provider: string;
  provider_refund_id: string | null;
  amount_minor: unknown;
  currency: unknown;
  status: unknown;
  failure_code: string | null;
}): RefundRow {
  if (!isRefundStatus(row.status)) throw new PaymentError("invariant", { dbCode: "UNEXPECTED_REFUND_STATUS" });
  return {
    refundId: row.id,
    paymentId: row.payment_id,
    provider: row.provider,
    providerRefundId: row.provider_refund_id ?? null,
    money: asUsd(row.amount_minor, row.currency),
    status: row.status,
    failureCode: row.failure_code ?? null,
  };
}

// ---- admin-scoped ----------------------------------------------------------
// admin_begin_payment_refund() runs with the ADMIN's own session (the
// cookie-based client): the database checks is_admin() itself and records
// auth.uid() as the requester. The secret key is not allowed to call it.
export type BegunRefund = {
  refundId: string;
  status: RefundStatus;
  // The same idempotency key was already used: this is that refund.
  reused: boolean;
  provider: PaymentProviderName;
  providerPaymentId: string;
  money: Money;
};

export async function beginRefundAsAdmin(
  adminDb: SupabaseClient,
  input: {
    paymentId: string;
    amountMinor: bigint;
    currency: string;
    reason: RefundReason;
    note: string | null;
    idempotencyKey: string;
    expectedRefundedMinor: bigint;
  },
): Promise<BegunRefund> {
  const { data, error } = await adminDb.rpc("admin_begin_payment_refund", {
    p_payment_id: input.paymentId,
    p_amount_minor: input.amountMinor.toString(),
    p_currency: input.currency,
    p_reason: input.reason,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
    p_expected_refunded_minor: input.expectedRefundedMinor.toString(),
  });
  if (error) throw toPaymentError(error, { paymentId: input.paymentId });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !isRefundStatus(row.refund_status) || typeof row.provider_payment_id !== "string") {
    throw new PaymentError("invariant", { paymentId: input.paymentId, dbCode: "NO_REFUND_RETURNED" });
  }
  return {
    refundId: row.refund_id,
    status: row.refund_status,
    reused: row.reused === true,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    money: asUsd(row.amount_minor, row.currency),
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
