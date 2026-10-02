import "server-only";

import { isPaymentError } from "./errors";
import { logPaymentEvent } from "./log";
import { getActivePaymentProvider } from "./registry";
import { createSupabasePaymentStore, type PaymentStore, type RecoverableEvent } from "./server/store";
import { getPaymentsAdminClient } from "./server/supabase-admin";
import { getPaymentServiceForProvider, type PaymentService } from "./service";

// Background reconciliation (Payments P5), provider-independent:
//
//   reconcileExpiredCheckouts — checkouts past their 60-minute reservation.
//     "Expired" only makes a checkout ELIGIBLE: each one goes through the
//     payment service's shared release decision (reconcileCheckoutForRelease),
//     which asks the provider first and finalizes / keeps / releases.
//
//   recoverPaymentEvents — authentic webhook events that were recorded but
//     never processed (process died after acknowledging) or whose processing
//     failed. Re-run through the service's processProviderEvent using only
//     the identifiers recorded at receipt — never raw request input — which
//     again ends in an authoritative provider lookup.
//
// Work is claimed by the database (bounded batch, deterministic order,
// skip-locked rows, leased with backoff), so overlapping runs never take the
// same row; everything downstream is idempotent regardless. Each item is
// isolated: one failure never stops the batch, and provider trouble always
// leaves stock reserved for a later attempt.
//
// No scheduling here: callers (an authenticated internal endpoint, tests,
// later a host timer) decide when to run.

export type CheckoutReconcileOutcome =
  | "finalized_paid"
  | "released_expired"
  | "still_processing"
  | "requires_review"
  | "provider_unavailable"
  | "already_closed"
  | "not_due"
  | "reconciliation_error";

export type EventRecoveryOutcome = "recovered_event" | "ignored_event" | "event_retry_scheduled" | "reconciliation_error";

export type ReconciliationSummary<T extends string> = { scanned: number; outcomes: Partial<Record<T, number>> };

export type ReconciliationDeps = {
  store: PaymentStore;
  // The payment service for a provider slug (each payment is reconciled by
  // the provider that created it).
  serviceFor: (provider: string) => PaymentService;
  // Provider to use for a checkout that never reached any provider.
  defaultProvider: () => string;
};

export const RECONCILE_LIMITS = Object.freeze({
  maxBatch: 50,
  // Leave the webhook's own after-response processing time to finish first.
  eventMinAgeSeconds: 120,
  // Recovery attempts per event before it is left for manual inspection.
  eventMaxAttempts: 8,
});

function bump<T extends string>(summary: ReconciliationSummary<T>, outcome: T): void {
  summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
}

function clampBatch(limit: number | undefined, fallback: number): number {
  const n = Number.isInteger(limit) ? (limit as number) : fallback;
  return Math.min(Math.max(n, 1), RECONCILE_LIMITS.maxBatch);
}

export function createReconciliationService(deps: ReconciliationDeps) {
  const { store, serviceFor, defaultProvider } = deps;

  // One checkout: decide with the provider, never from time alone.
  async function reconcileCheckout(checkoutSessionId: string): Promise<CheckoutReconcileOutcome> {
    try {
      const attempts = await store.listSessionPayments(checkoutSessionId);
      const providerName = attempts.find((a) => a.providerPaymentId)?.provider ?? attempts[0]?.provider ?? defaultProvider();
      const result = await serviceFor(providerName).reconcileCheckoutForRelease(checkoutSessionId, "expiry");
      switch (result.kind) {
        case "finalized":
          return "finalized_paid";
        case "released":
          return "released_expired";
        case "still_processing":
          return "still_processing";
        case "requires_review":
          return "requires_review";
        case "closed":
          return "already_closed";
        case "not_due":
          return "not_due";
      }
    } catch (error) {
      const code = isPaymentError(error) ? error.code : "unknown";
      // Provider unreachable/garbled: keep the reservation, retry later.
      if (code === "provider_unavailable" || code === "provider_malformed_response") return "provider_unavailable";
      logPaymentEvent("error", "reconciliation_error", { checkoutSessionId, code, dbCode: isPaymentError(error) ? error.details.dbCode : undefined });
      return "reconciliation_error";
    }
  }

  async function reconcileExpiredCheckouts(options: { limit?: number } = {}): Promise<ReconciliationSummary<CheckoutReconcileOutcome>> {
    const claimed = await store.claimExpiredCheckouts(clampBatch(options.limit, 20));
    const summary: ReconciliationSummary<CheckoutReconcileOutcome> = { scanned: claimed.length, outcomes: {} };
    for (const { checkoutSessionId, attempts } of claimed) {
      const outcome = await reconcileCheckout(checkoutSessionId);
      bump(summary, outcome);
      logPaymentEvent(outcome === "reconciliation_error" ? "error" : "info", "checkout_reconciled", {
        checkoutSessionId,
        outcome,
        attempts,
      });
    }
    logPaymentEvent("info", "checkout_reconciliation_run", { summary: JSON.stringify({ scanned: summary.scanned, ...summary.outcomes }) });
    return summary;
  }

  // One recorded event, through the service's normal processing (which
  // records the outcome on the event itself: processed / ignored /
  // verification_failed / error). Shared by the batch and the admin retry.
  async function recoverEvent(event: RecoverableEvent): Promise<EventRecoveryOutcome> {
    let outcome: EventRecoveryOutcome;
    try {
      let providerPaymentId = event.providerPaymentId;
      if (!providerPaymentId && event.paymentId) {
        providerPaymentId = (await store.getPaymentContext({ paymentId: event.paymentId }))?.providerPaymentId ?? null;
      }
      const result = await serviceFor(event.provider).processProviderEvent({
        eventId: event.eventId,
        eventType: event.eventType,
        hint: { eventId: event.providerEventId, eventType: event.eventType, providerPaymentId, reference: event.reference },
      });
      outcome = result.kind === "processed" ? "recovered_event" : result.kind === "ignored" ? "ignored_event" : "event_retry_scheduled";
    } catch (error) {
      outcome = "reconciliation_error";
      logPaymentEvent("error", "reconciliation_error", { provider: event.provider, eventType: event.eventType, code: isPaymentError(error) ? error.code : "unknown" });
    }
    logPaymentEvent("info", "payment_event_recovery", { provider: event.provider, eventType: event.eventType, outcome, attempts: event.attempts });
    return outcome;
  }

  async function recoverPaymentEvents(options: { limit?: number } = {}): Promise<ReconciliationSummary<EventRecoveryOutcome>> {
    const events = await store.claimRecoverableEvents({
      limit: clampBatch(options.limit, 20),
      minAgeSeconds: RECONCILE_LIMITS.eventMinAgeSeconds,
      maxAttempts: RECONCILE_LIMITS.eventMaxAttempts,
    });
    const summary: ReconciliationSummary<EventRecoveryOutcome> = { scanned: events.length, outcomes: {} };
    for (const event of events) bump(summary, await recoverEvent(event));
    logPaymentEvent("info", "event_recovery_run", { summary: JSON.stringify({ scanned: summary.scanned, ...summary.outcomes }) });
    return summary;
  }

  // Admin-requested retry of ONE recorded event (Payments P6), including one
  // that exhausted automatic recovery. Claimed through the database first, so
  // concurrent clicks/sweeps process it at most once per lease; "not_claimable"
  // when it is already processed, too fresh or a retry is in flight.
  async function retryRecordedEvent(eventId: string): Promise<EventRecoveryOutcome | "not_claimable"> {
    const event = await store.claimEventForRetry(eventId);
    if (!event) return "not_claimable";
    return recoverEvent(event);
  }

  async function runReconciliation(options: { checkoutLimit?: number; eventLimit?: number } = {}) {
    const events = await recoverPaymentEvents({ limit: options.eventLimit });
    const checkouts = await reconcileExpiredCheckouts({ limit: options.checkoutLimit });
    return { events, checkouts };
  }

  return { reconcileCheckout, reconcileExpiredCheckouts, recoverPaymentEvents, retryRecordedEvent, runReconciliation };
}

export type ReconciliationService = ReturnType<typeof createReconciliationService>;

// Default wiring: payments-only secret-key store, each provider's own
// payment service, the active provider for checkouts that never reached one.
export function getReconciliationService(): ReconciliationService {
  return createReconciliationService({
    store: createSupabasePaymentStore(getPaymentsAdminClient()),
    serviceFor: (provider) => getPaymentServiceForProvider(provider),
    defaultProvider: () => getActivePaymentProvider().name,
  });
}
