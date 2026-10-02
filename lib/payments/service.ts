import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

import { isPaymentError, PaymentError } from "./errors";
import { logPaymentEvent } from "./log";
import type { Money } from "./money";
import type { PaymentProvider } from "./provider";
import { getActivePaymentProvider, getPaymentProviderByName } from "./registry";
import {
  beginCheckoutAsCustomer,
  createSupabasePaymentStore,
  type PaymentContext,
  type PaymentEventDetails,
  type PaymentStore,
  type StartedCheckout,
} from "./server/store";
import { getPaymentsAdminClient } from "./server/supabase-admin";
import {
  isPaymentStatus,
  SETTLED_PAYMENT_STATUSES,
  type PaymentDisplaySummary,
  type PaymentStatus,
  type ProviderEventHint,
  type ProviderState,
  type VerifiedProviderPayment,
} from "./types";
import { evaluateProviderPayment, type VerificationIssue } from "./verification";

// Provider-independent payment orchestration: the P1 database functions on
// one side, a PaymentProvider adapter on the other. Nothing here is specific
// to any provider, and nothing here trusts payment data from a browser:
//
//   - amounts/currency always come from the checkout session in the
//     database (begin_checkout -> create_payment_attempt);
//   - a payment becomes "paid" only through verifyPayment(), which asks the
//     provider directly (fetchPayment) and applies evaluateProviderPayment();
//   - an order is only ever created by finalize_paid_checkout() after that;
//   - events (webhooks) and redirects are hints that trigger verifyPayment(),
//     never decisions.
//
// Concurrency/idempotency is delegated to the database (per-customer locks,
// unique indexes, idempotent functions) — there is no in-memory locking, so
// a webhook and a customer return may verify the same payment at once.
//
// Stock is never released here: releasing a reservation belongs to the later
// expiry/reconciliation phase, after the provider confirms nothing was paid.

export type ProviderCheckout = {
  paymentId: string;
  checkoutSessionId: string;
  providerPaymentId: string;
  redirectUrl: string;
  money: Money;
  // The payment attempt already existed (retry/double submit).
  reusedAttempt: boolean;
  // The existing provider payment was resumed instead of creating one.
  resumedProviderPayment: boolean;
};

export type VerificationResult =
  | { kind: "finalized"; paymentId: string; orderId: string; created: boolean }
  | { kind: "not_paid"; paymentId: string; status: PaymentStatus }
  | { kind: "not_bound"; paymentId: string }
  | { kind: "status_recorded"; paymentId: string; status: PaymentStatus }
  | { kind: "requires_review"; paymentId: string; reasons: readonly string[] }
  | { kind: "payment_conflict"; paymentId: string };

// Outcome of a customer's request to stop a checkout.
export type CancelCheckoutResult =
  // The provider had in fact been paid: the order exists (or now does).
  | { kind: "finalized"; orderId: string }
  // Reservation returned; the cart was never touched.
  | { kind: "released"; status: "cancelled" | "expired" }
  // The provider is mid-authorization: releasing now could race a payment.
  | { kind: "still_processing" }
  // A payment needs manual review; the reservation is kept for it.
  | { kind: "requires_review" }
  // Already closed earlier (cancelled/expired/payment_conflict).
  | { kind: "closed"; status: string };

export type EventHandlingResult =
  | { kind: "rejected" }
  | { kind: "duplicate"; eventId: string }
  | { kind: "ignored"; eventId: string }
  | { kind: "processed"; eventId: string; verification: VerificationResult }
  | { kind: "error"; eventId: string; code: string };

export type PaymentService = ReturnType<typeof createPaymentService>;

export type ReceivedProviderEvent =
  | { kind: "rejected" }
  | { kind: "duplicate"; eventId: string }
  | { kind: "accepted"; eventId: string; eventType: string; hint: ProviderEventHint };

// ---- input validation ---------------------------------------------------------
// strictObject: unknown keys (an "amount", "price" or "currency" a browser
// might add) are rejected outright rather than silently ignored.
const startCheckoutInput = z.strictObject({
  addressId: z.uuid(),
  idempotencyKey: z.uuid(),
});

const httpUrl = z.url({ protocol: /^https?$/ }).max(2048);
const providerCheckoutInput = z.strictObject({
  checkoutSessionId: z.uuid(),
  returnUrl: httpUrl,
  cancelUrl: httpUrl,
});

const verifyLookup = z.union([
  z.strictObject({ paymentId: z.uuid() }),
  z.strictObject({ providerPaymentId: z.string().min(1).max(255) }),
]);

const providerResult = z.object({
  providerPaymentId: z.string().min(1).max(255),
  redirectUrl: z.url({ protocol: /^https?$/ }).max(4096),
});

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PaymentError("invalid_input");
  return parsed.data;
}

// ---- helpers --------------------------------------------------------------------
const SAFE_TEXT = /^[\x20-\x7e]*$/;

function clip(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const ascii = SAFE_TEXT.test(value) ? value : value.replace(/[^\x20-\x7e]/g, "?");
  return ascii.slice(0, max);
}

// Mirror of the database allow-list; anything else is dropped.
function sanitizeDisplay(display: PaymentDisplaySummary | undefined): PaymentDisplaySummary | undefined {
  if (!display) return undefined;
  const out: PaymentDisplaySummary = {};
  if (display.brand) out.brand = clip(display.brand, 64);
  if (display.method) out.method = clip(display.method, 64);
  if (display.environment) out.environment = clip(display.environment, 64);
  if (display.last4 && /^[0-9]{4}$/.test(display.last4)) out.last4 = display.last4;
  for (const key of Object.keys(out) as (keyof PaymentDisplaySummary)[]) if (out[key] === undefined) delete out[key];
  return Object.keys(out).length > 0 ? out : undefined;
}

// Provider calls: anything that isn't already a PaymentError becomes a
// generic provider_unavailable — the raw error stays a non-enumerable cause.
async function callProvider<T>(fn: () => Promise<T>, details: { paymentId?: string; provider: string }): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isPaymentError(error)) throw error;
    throw new PaymentError("provider_unavailable", details, { cause: error });
  }
}

function assertVerifiedShape(verified: VerifiedProviderPayment, details: { paymentId: string; provider: string }): void {
  const ok =
    verified &&
    typeof verified.provider === "string" &&
    typeof verified.providerPaymentId === "string" &&
    (verified.reference === null || typeof verified.reference === "string") &&
    isPaymentStatus(verified.status) &&
    (verified.money === null ||
      (typeof verified.money === "object" &&
        typeof verified.money.currency === "string" &&
        typeof verified.money.amountMinor === "bigint")) &&
    (verified.environment === "sandbox" || verified.environment === "live") &&
    typeof verified.accountMatches === "boolean";
  if (!ok) throw new PaymentError("provider_malformed_response", details);
}

export function createPaymentService(deps: { provider: PaymentProvider; store: PaymentStore }) {
  const { provider, store } = deps;

  // ---- A. internal checkout -----------------------------------------------------
  // Reserves stock into a checkout session for the signed-in customer behind
  // `customerDb` (their own session client). The idempotency key is generated
  // by the application (e.g. once per rendered checkout form) so a double
  // submit maps to the same session.
  async function startCheckout(customerDb: SupabaseClient, input: unknown): Promise<StartedCheckout> {
    const { addressId, idempotencyKey } = parseInput(startCheckoutInput, input);
    const started = await beginCheckoutAsCustomer(customerDb, { addressId, idempotencyKey });
    logPaymentEvent("info", "checkout_started", {
      checkoutSessionId: started.checkoutSessionId,
      status: started.status,
      reused: started.reused,
    });
    return started;
  }

  // ---- B. payment attempt + provider checkout ----------------------------------
  // `customerDb` must be the customer's own session client: the session is
  // read through RLS first, so a customer can only pay for their own checkout.
  async function createProviderCheckout(customerDb: SupabaseClient, input: unknown): Promise<ProviderCheckout> {
    const { checkoutSessionId, returnUrl, cancelUrl } = parseInput(providerCheckoutInput, input);

    const { data: owned, error: ownedError } = await customerDb
      .from("checkout_sessions")
      .select("id")
      .eq("id", checkoutSessionId)
      .maybeSingle();
    if (ownedError) throw new PaymentError("database", { checkoutSessionId }, { cause: ownedError });
    if (!owned) throw new PaymentError("not_found", { checkoutSessionId });

    // Amount/currency come from the session row inside the database function.
    const attempt = await store.createPaymentAttempt(checkoutSessionId, provider.name);
    const base = { paymentId: attempt.paymentId, provider: provider.name };

    const created = parseProviderResult(
      await callProvider(
        () =>
          provider.createCheckout({
            reference: attempt.paymentId,
            money: attempt.money,
            returnUrl,
            cancelUrl,
            existingProviderPaymentId: attempt.providerPaymentId,
          }),
        base,
      ),
      base,
    );

    if (attempt.providerPaymentId) {
      // Resuming: the adapter must hand back the SAME provider payment.
      if (created.providerPaymentId !== attempt.providerPaymentId) {
        logPaymentEvent("error", "provider_resume_mismatch", { ...base, checkoutSessionId });
        throw new PaymentError("reconciliation_required", { ...base, checkoutSessionId, providerPaymentId: created.providerPaymentId });
      }
      return result(attempt.providerPaymentId, created.redirectUrl, true);
    }

    try {
      await store.attachProviderPayment(attempt.paymentId, provider.name, created.providerPaymentId);
    } catch (error) {
      // A concurrent request for the same attempt bound a different provider
      // payment first: continue with THAT one (resume it) and never hand out
      // the link we just created — the customer can only ever pay the bound
      // payment.
      if (isPaymentError(error) && error.details.dbCode === "PROVIDER_PAYMENT_ALREADY_BOUND") {
        const current = await store.getPaymentContext({ paymentId: attempt.paymentId });
        if (current?.providerPaymentId) {
          logPaymentEvent("warn", "provider_checkout_superseded", { ...base, checkoutSessionId });
          const resumed = parseProviderResult(
            await callProvider(
              () =>
                provider.createCheckout({
                  reference: attempt.paymentId,
                  money: attempt.money,
                  returnUrl,
                  cancelUrl,
                  existingProviderPaymentId: current.providerPaymentId,
                }),
              base,
            ),
            base,
          );
          if (resumed.providerPaymentId === current.providerPaymentId) {
            return result(current.providerPaymentId, resumed.redirectUrl, true);
          }
        }
      }
      // The provider payment exists but Nexora could not record it. Do not
      // create another one blindly; surface it for reconciliation (the
      // provider payment carries our reference, so it can be matched later).
      logPaymentEvent("error", "provider_payment_unrecorded", {
        ...base,
        checkoutSessionId,
        dbCode: isPaymentError(error) ? error.details.dbCode : undefined,
      });
      throw new PaymentError(
        "reconciliation_required",
        { ...base, checkoutSessionId, providerPaymentId: created.providerPaymentId, dbCode: isPaymentError(error) ? error.details.dbCode : undefined },
        { cause: error },
      );
    }

    return result(created.providerPaymentId, created.redirectUrl, false);

    function result(providerPaymentId: string, redirectUrl: string, resumed: boolean): ProviderCheckout {
      logPaymentEvent("info", "provider_checkout_ready", { ...base, checkoutSessionId, reused: attempt.reused });
      return {
        paymentId: attempt.paymentId,
        checkoutSessionId,
        providerPaymentId,
        redirectUrl,
        money: attempt.money,
        reusedAttempt: attempt.reused,
        resumedProviderPayment: resumed,
      };
    }
  }

  function parseProviderResult(value: unknown, details: { paymentId: string; provider: string }) {
    const parsed = providerResult.safeParse(value);
    if (!parsed.success) throw new PaymentError("provider_malformed_response", details);
    return parsed.data;
  }

  // ---- C/D/E. verification ------------------------------------------------------
  async function verifyPayment(lookup: unknown): Promise<VerificationResult> {
    const ref = parseInput(verifyLookup, lookup);
    const ctx = await store.getPaymentContext(
      "paymentId" in ref ? { paymentId: ref.paymentId } : { provider: provider.name, providerPaymentId: ref.providerPaymentId },
    );
    if (!ctx) throw new PaymentError("not_found", "paymentId" in ref ? { paymentId: ref.paymentId } : {});

    // A payment is only ever verified by the adapter of the provider that
    // created it.
    if (ctx.provider !== provider.name) {
      throw new PaymentError("configuration", { dbCode: "PAYMENT_PROVIDER_MISMATCH", paymentId: ctx.paymentId, provider: ctx.provider });
    }
    if (!ctx.providerPaymentId) return { kind: "not_bound", paymentId: ctx.paymentId };

    const base = { paymentId: ctx.paymentId, provider: provider.name };
    const providerPaymentId = ctx.providerPaymentId;
    const verified = await callProvider(() => provider.fetchPayment({ providerPaymentId, reference: ctx.paymentId }), base);
    assertVerifiedShape(verified, base);

    const decision = evaluateProviderPayment(
      {
        provider: ctx.provider,
        providerPaymentId,
        reference: ctx.paymentId,
        environment: provider.environment,
        money: ctx.money,
      },
      verified,
    );

    if (decision.kind === "reject") return reject(ctx, decision.issues, verified);
    // The lookup is about this payment: keep what the provider reported, for
    // operations (P6). Best-effort — it never blocks the decision below.
    await recordProviderState(ctx, verified);
    if (decision.kind === "accept_paid") return acceptPaid(ctx, verified);
    return recordNonPaid(ctx, verified);
  }

  async function recordProviderState(ctx: PaymentContext, verified: VerifiedProviderPayment): Promise<void> {
    const state: ProviderState = verified.providerState ?? (verified.status === "requires_review" ? "review" : verified.status);
    try {
      await store.recordProviderState(ctx.paymentId, state);
    } catch (error) {
      logPaymentEvent("warn", "provider_state_not_recorded", { paymentId: ctx.paymentId, provider: ctx.provider, code: isPaymentError(error) ? error.code : "unknown" });
    }
  }

  async function acceptPaid(ctx: PaymentContext, verified: VerifiedProviderPayment): Promise<VerificationResult> {
    let status: PaymentStatus;
    try {
      status = await store.recordPaymentStatus({
        paymentId: ctx.paymentId,
        status: "paid",
        // Already proven equal to ctx.money; the database checks again.
        verified: { currency: verified.money!.currency, amountMinor: verified.money!.amountMinor },
        display: sanitizeDisplay(verified.display),
      });
    } catch (error) {
      // e.g. refunded -> paid is not a legal transition: keep what's stored.
      if (isPaymentError(error) && error.details.dbCode === "ILLEGAL_PAYMENT_TRANSITION") {
        logPaymentEvent("warn", "paid_transition_refused", { paymentId: ctx.paymentId, provider: ctx.provider, status: ctx.status });
        return ctx.status === "requires_review"
          ? { kind: "requires_review", paymentId: ctx.paymentId, reasons: ["ALREADY_UNDER_REVIEW"] }
          : { kind: "status_recorded", paymentId: ctx.paymentId, status: ctx.status };
      }
      throw error;
    }

    // The database moved it to review instead (amount/currency mismatch on
    // its own check, or another payment for this checkout already settled).
    if (status !== "paid") {
      logPaymentEvent("warn", "payment_review_by_database", { paymentId: ctx.paymentId, provider: ctx.provider, status });
      return { kind: "requires_review", paymentId: ctx.paymentId, reasons: ["DATABASE_REVIEW"] };
    }

    const { orderId, outcome } = await store.finalizePaidCheckout(ctx.paymentId);
    logPaymentEvent("info", "payment_finalize", { paymentId: ctx.paymentId, provider: ctx.provider, outcome, orderId: orderId ?? undefined });
    switch (outcome) {
      case "created":
      case "already_finalized":
        if (!orderId) throw new PaymentError("invariant", { paymentId: ctx.paymentId, dbCode: "FINALIZED_WITHOUT_ORDER" });
        return { kind: "finalized", paymentId: ctx.paymentId, orderId, created: outcome === "created" };
      case "payment_conflict":
        return { kind: "payment_conflict", paymentId: ctx.paymentId };
      case "duplicate_payment":
        return { kind: "requires_review", paymentId: ctx.paymentId, reasons: ["DUPLICATE_PAYMENT"] };
      case "rejected":
        return { kind: "requires_review", paymentId: ctx.paymentId, reasons: ["FINALIZE_INTEGRITY_MISMATCH"] };
    }
  }

  async function recordNonPaid(ctx: PaymentContext, verified: VerifiedProviderPayment): Promise<VerificationResult> {
    const target = verified.status;
    const wasSettled = SETTLED_PAYMENT_STATUSES.includes(ctx.status);

    // Money was recorded as received, but the provider now reports an
    // earlier/non-paid state: never silently downgrade — review it.
    if (wasSettled && ["pending", "processing", "failed", "cancelled", "expired"].includes(target)) {
      return reviewWithoutEvidence(ctx, "PROVIDER_STATUS_REGRESSION");
    }
    if (target === "requires_review") {
      return reviewWithoutEvidence(ctx, clip(verified.failureCode, 64) ?? "PROVIDER_REVIEW", verified.failureMessage);
    }

    try {
      const status = await store.recordPaymentStatus({
        paymentId: ctx.paymentId,
        status: target,
        failureCode: target === "failed" ? clip(verified.failureCode, 64) : undefined,
        failureMessage: target === "failed" ? clip(verified.failureMessage, 500) : undefined,
        display: sanitizeDisplay(verified.display),
      });
      logPaymentEvent("info", "payment_status_recorded", { paymentId: ctx.paymentId, provider: ctx.provider, status });
      return target === "refunded" || target === "partially_refunded"
        ? { kind: "status_recorded", paymentId: ctx.paymentId, status }
        : { kind: "not_paid", paymentId: ctx.paymentId, status };
    } catch (error) {
      if (isPaymentError(error) && error.details.dbCode === "ILLEGAL_PAYMENT_TRANSITION") {
        // A refund for a payment Nexora never saw as paid is an anomaly.
        if (target === "refunded" || target === "partially_refunded") {
          return reviewWithoutEvidence(ctx, "UNEXPECTED_REFUND");
        }
        // Otherwise the stored state is already further along (e.g. the
        // reservation was released and the attempt closed): keep it.
        logPaymentEvent("info", "payment_status_unchanged", { paymentId: ctx.paymentId, provider: ctx.provider, status: ctx.status });
        return { kind: "not_paid", paymentId: ctx.paymentId, status: ctx.status };
      }
      throw error;
    }
  }

  // Security-relevant mismatch between Nexora and the provider: no order, the
  // payment goes to review, and the expected/received identifiers are kept
  // as an internal audit event for investigation.
  async function reject(ctx: PaymentContext, issues: readonly VerificationIssue[], verified: VerifiedProviderPayment): Promise<VerificationResult> {
    logPaymentEvent("warn", "payment_verification_rejected", { paymentId: ctx.paymentId, provider: ctx.provider, issues: issues.join(",") });
    const details: PaymentEventDetails = {
      reason: issues.join(","),
      environment: clip(verified.environment, 64) ?? null,
      account_matches: verified.accountMatches === true,
      expected_reference: ctx.paymentId,
      received_reference: clip(verified.reference ?? undefined, 200) ?? null,
      expected_provider_payment_id: ctx.providerPaymentId,
      received_provider_payment_id: clip(verified.providerPaymentId, 200) ?? null,
      expected_amount_minor: ctx.money.amountMinor.toString(),
      received_amount_minor: typeof verified.money?.amountMinor === "bigint" ? verified.money.amountMinor.toString().slice(0, 40) : null,
      expected_currency: ctx.money.currency,
      received_currency: clip(verified.money?.currency, 16) ?? null,
    };
    try {
      const event = await store.recordPaymentEvent({
        provider: ctx.provider,
        providerEventId: `internal:${randomUUID()}`,
        eventType: "internal.verification_rejected",
        signatureValid: true,
        paymentId: ctx.paymentId,
        details,
      });
      await store.markPaymentEventProcessed({ eventId: event.eventId, outcome: "verification_failed", paymentId: ctx.paymentId });
    } catch (error) {
      // The audit record is best-effort; the review transition below is not.
      logPaymentEvent("error", "verification_audit_failed", { paymentId: ctx.paymentId, provider: ctx.provider, code: isPaymentError(error) ? error.code : "unknown" });
    }
    return reviewWithoutEvidence(ctx, issues[0], "Provider verification did not match the expected payment.", issues);
  }

  async function reviewWithoutEvidence(
    ctx: PaymentContext,
    failureCode: string,
    failureMessage?: string,
    reasons: readonly string[] = [failureCode],
  ): Promise<VerificationResult> {
    // Already under review: keep the ORIGINAL reason (e.g. a duplicate charge
    // that is now also disputed); the new development is visible in
    // provider_state / the event timeline.
    const keepReason = ctx.status === "requires_review";
    await store.recordPaymentStatus({
      paymentId: ctx.paymentId,
      status: "requires_review",
      failureCode: keepReason ? undefined : clip(failureCode, 64),
      failureMessage: keepReason ? undefined : clip(failureMessage, 500),
    });
    logPaymentEvent("warn", "payment_requires_review", { paymentId: ctx.paymentId, provider: ctx.provider, code: failureCode });
    return { kind: "requires_review", paymentId: ctx.paymentId, reasons };
  }

  // ---- provider events (webhooks) ---------------------------------------------
  // Authenticity is checked by the adapter on the RAW body. An authentic event
  // is recorded once (duplicates are acknowledged and ignored) and then only
  // triggers verifyPayment() for the payment it names.
  //
  // Split in two so a webhook route can acknowledge the provider quickly
  // (Safepay retries anything not answered within 10 s) and do the slower
  // verification after responding — the event is durably recorded first:
  //   receiveProviderEvent  — verify signature, record, dedupe   (fast)
  //   processProviderEvent  — authoritative verification/finalize (slow)
  // handleProviderEvent runs both, in order.
  async function receiveProviderEvent(input: { rawBody: string; headers: Headers }): Promise<ReceivedProviderEvent> {
    let parsed;
    try {
      parsed = await provider.parseEvent(input);
    } catch (error) {
      parsed = { authentic: false as const, reason: "unparseable", claimedEventId: null, claimedEventType: null };
      logPaymentEvent("warn", "provider_event_unparseable", { provider: provider.name, code: isPaymentError(error) ? error.code : "unknown" });
    }

    if (!parsed.authentic) {
      await store.recordPaymentEvent({
        provider: provider.name,
        providerEventId: safeEventToken(parsed.claimedEventId, 255) ?? `unverified:${randomUUID()}`,
        eventType: safeEventToken(parsed.claimedEventType, 100) ?? "unknown",
        signatureValid: false,
        details: { reason: clip(parsed.reason, 200) ?? "unauthentic" },
      });
      logPaymentEvent("warn", "provider_event_rejected", { provider: provider.name });
      return { kind: "rejected" };
    }

    const { hint } = parsed;
    const eventId = safeEventToken(hint.eventId, 255);
    const eventType = safeEventToken(hint.eventType, 100) ?? "unknown";
    if (!eventId) throw new PaymentError("provider_malformed_response", { provider: provider.name });

    // The ids the authentic event named are kept with it, so a recorded
    // event can be recovered later (reconciliation) without the raw request.
    const details: PaymentEventDetails = {};
    const namedPayment = safeEventToken(hint.providerPaymentId, 255);
    const namedReference = safeEventToken(hint.reference, 255);
    if (namedPayment) details.provider_payment_id = namedPayment;
    if (namedReference) details.reference = namedReference;
    const recorded = await store.recordPaymentEvent({
      provider: provider.name,
      providerEventId: eventId,
      eventType,
      signatureValid: true,
      details,
    });
    if (recorded.duplicate) {
      logPaymentEvent("info", "provider_event_duplicate", { provider: provider.name, eventType });
      return { kind: "duplicate", eventId: recorded.eventId };
    }
    return { kind: "accepted", eventId: recorded.eventId, eventType, hint };
  }

  async function processProviderEvent(event: { eventId: string; eventType: string; hint: ProviderEventHint }): Promise<EventHandlingResult> {
    const { eventId, eventType, hint } = event;
    try {
      const ctx = hint.providerPaymentId
        ? await store.getPaymentContext({ provider: provider.name, providerPaymentId: hint.providerPaymentId })
        : hint.reference && z.uuid().safeParse(hint.reference).success
          ? await store.getPaymentContext({ paymentId: hint.reference })
          : null;

      if (!ctx) {
        await store.markPaymentEventProcessed({ eventId, outcome: "ignored" });
        logPaymentEvent("info", "provider_event_ignored", { provider: provider.name, eventType });
        return { kind: "ignored", eventId };
      }

      const verification = await verifyPayment({ paymentId: ctx.paymentId });
      await store.markPaymentEventProcessed({
        eventId,
        outcome: verification.kind === "requires_review" ? "verification_failed" : "processed",
        paymentId: ctx.paymentId,
      });
      return { kind: "processed", eventId, verification };
    } catch (error) {
      const code = isPaymentError(error) ? error.code : "unknown";
      logPaymentEvent("error", "provider_event_failed", { provider: provider.name, eventType, code });
      // Keep the identifiers the event named alongside the error code: the
      // database replaces details on update, and recovery needs them.
      const keep: PaymentEventDetails = { code };
      const namedPayment = safeEventToken(hint.providerPaymentId, 255);
      const namedReference = safeEventToken(hint.reference, 255);
      if (namedPayment) keep.provider_payment_id = namedPayment;
      if (namedReference) keep.reference = namedReference;
      await store.markPaymentEventProcessed({ eventId, outcome: "error", details: keep }).catch(() => undefined);
      return { kind: "error", eventId, code };
    }
  }

  async function handleProviderEvent(input: { rawBody: string; headers: Headers }): Promise<EventHandlingResult> {
    const received = await receiveProviderEvent(input);
    return received.kind === "accepted" ? processProviderEvent(received) : received;
  }

  // ---- customer cancel / refresh -------------------------------------------------
  // Reads the session through the CUSTOMER's own client (RLS), so a customer
  // can only ever act on their own checkout.
  async function ownSession(customerDb: SupabaseClient, checkoutSessionId: string) {
    const { data, error } = await customerDb
      .from("checkout_sessions")
      .select("id, status, order_id, reserved_until")
      .eq("id", checkoutSessionId)
      .maybeSingle();
    if (error) throw new PaymentError("database", { checkoutSessionId }, { cause: error });
    if (!data) throw new PaymentError("not_found", { checkoutSessionId });
    return data as { id: string; status: string; order_id: string | null; reserved_until: string };
  }

  // ---- release decision (shared by customer cancel and the expiry sweep) -------
  // The ONE place that decides whether an open checkout's stock reservation
  // may be returned. Time alone never releases anything: the provider is asked
  // FIRST about every attempt that reached it.
  //   - paid                         -> finalize instead (order, not release)
  //   - processing/authorizing       -> keep, try again later
  //   - requires review / conflict   -> keep (manual review)
  //   - provider error/timeout       -> throws (caller keeps the reservation)
  //   - nothing paid / never reached -> release, exactly once (database)
  // A payment that still arrives afterwards is handled by
  // finalize_paid_checkout's late-payment path (re-reserve or conflict).
  //
  // mode "expiry"  : only once reserved_until has passed (else not_due);
  //                  released as 'expired'.
  // mode "customer": the owner's explicit cancel; released as 'cancelled'
  //                  ('expired' if the hold had already lapsed).
  async function reconcileCheckoutForRelease(
    checkoutSessionId: string,
    mode: "expiry" | "customer",
  ): Promise<CancelCheckoutResult | { kind: "not_due" }> {
    const session = await store.getCheckoutSession(checkoutSessionId);
    if (!session) throw new PaymentError("not_found", { checkoutSessionId });
    if (session.status === "completed" && session.orderId) return { kind: "finalized", orderId: session.orderId };
    if (session.status !== "awaiting_payment") return { kind: "closed", status: session.status };
    const lapsed = new Date(session.reservedUntil).getTime() <= Date.now();
    if (mode === "expiry" && !lapsed) return { kind: "not_due" };

    for (const attempt of await store.listSessionPayments(checkoutSessionId)) {
      if (attempt.status === "requires_review") return { kind: "requires_review" };
      if (!attempt.providerPaymentId) continue; // never reached the provider
      if (attempt.provider !== provider.name) {
        throw new PaymentError("configuration", { dbCode: "PAYMENT_PROVIDER_MISMATCH", paymentId: attempt.paymentId, provider: attempt.provider });
      }
      const result = await verifyPayment({ paymentId: attempt.paymentId });
      if (result.kind === "finalized") return { kind: "finalized", orderId: result.orderId };
      if (result.kind === "requires_review" || result.kind === "payment_conflict") return { kind: "requires_review" };
      if (result.kind === "not_paid" && result.status === "processing") return { kind: "still_processing" };
      if (result.kind === "not_paid" && result.status === "requires_review") return { kind: "requires_review" };
      if (result.kind === "status_recorded") return { kind: "requires_review" }; // refunds on an open checkout: anomaly
    }

    const reason = mode === "expiry" || lapsed ? "expired" : "cancelled";
    const outcome = await store.releaseCheckoutSession(checkoutSessionId, reason);
    logPaymentEvent("info", "checkout_released", { checkoutSessionId, provider: provider.name, outcome });
    if (outcome.startsWith("noop:")) {
      const current = await store.getCheckoutSession(checkoutSessionId);
      return current?.status === "completed" && current.orderId
        ? { kind: "finalized", orderId: current.orderId }
        : { kind: "closed", status: current?.status ?? "unknown" };
    }
    return { kind: "released", status: reason };
  }

  // The customer's explicit "cancel checkout": ownership is checked through
  // their own RLS-scoped client first, then the shared release decision.
  async function cancelCheckout(customerDb: SupabaseClient, input: unknown): Promise<CancelCheckoutResult> {
    const { checkoutSessionId } = parseInput(z.strictObject({ checkoutSessionId: z.uuid() }), input);
    await ownSession(customerDb, checkoutSessionId);
    const result = await reconcileCheckoutForRelease(checkoutSessionId, "customer");
    return result.kind === "not_due" ? { kind: "closed", status: "awaiting_payment" } : result;
  }

  // Re-verify the latest attempt of the customer's checkout with the provider
  // (status page "check again" / auto-refresh). Never trusts browser state.
  async function refreshCheckout(customerDb: SupabaseClient, input: unknown): Promise<VerificationResult | { kind: "no_attempt" }> {
    const { checkoutSessionId } = parseInput(z.strictObject({ checkoutSessionId: z.uuid() }), input);
    await ownSession(customerDb, checkoutSessionId);
    const attempts = (await store.listSessionPayments(checkoutSessionId)).filter((a) => a.providerPaymentId);
    const latest = attempts.at(-1);
    if (!latest) return { kind: "no_attempt" };
    return verifyPayment({ paymentId: latest.paymentId });
  }

  return {
    startCheckout,
    createProviderCheckout,
    verifyPayment,
    receiveProviderEvent,
    processProviderEvent,
    handleProviderEvent,
    cancelCheckout,
    refreshCheckout,
    reconcileCheckoutForRelease,
  };
}

// Event identifiers/types from a provider: printable ASCII only, bounded.
function safeEventToken(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > max) return undefined;
  return /^[\x21-\x7e]+$/.test(value) ? value : undefined;
}

// Default wiring for the app: the configured provider + the Supabase store
// using the payments-only secret-key client. Fails closed (PaymentError
// 'configuration') when either is not configured.
export function getPaymentService(): PaymentService {
  return createPaymentService({
    provider: getActivePaymentProvider(),
    store: createSupabasePaymentStore(getPaymentsAdminClient()),
  });
}

// For provider-specific entry points (e.g. a provider's webhook route): the
// service bound to that provider regardless of which one is active for new
// checkouts, so events for existing payments keep working after a switch.
export function getPaymentServiceForProvider(name: string): PaymentService {
  return createPaymentService({
    provider: getPaymentProviderByName(name),
    store: createSupabasePaymentStore(getPaymentsAdminClient()),
  });
}
