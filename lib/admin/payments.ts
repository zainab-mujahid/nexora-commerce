"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { isPaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getReconciliationService } from "@/lib/payments/reconciliation";
import { MoneyFormatError, usdDecimalToMinor } from "@/lib/payments/money";
import { getPaymentServiceForProvider, type RefundResult, type VerificationResult } from "@/lib/payments/service";
import { REFUND_REASONS } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";

import { formatMinor, refundFailureLabel, REVIEW_RESOLUTIONS, reviewReason } from "./payment-presentation";

// Admin payment-operations actions (Payments P6/P7): re-verify with the
// provider, retry a recorded event, append a review note, and (P7) request a
// refund. There is deliberately no action that sets a payment status, an
// amount or a provider reference, or edits/deletes history. Every action
// re-checks the admin role itself — Server Actions are reachable by direct
// POST, not only through the admin pages — and takes nothing from the browser
// but ids and intent (a closed-set resolution/reason, a note, a refund amount
// the server validates against the database).

export type PaymentActionState = { error: string } | { success: string } | undefined;

const uuid = z.uuid();

function revalidatePayments(paymentId?: string) {
  revalidatePath("/admin/payments");
  if (paymentId) revalidatePath(`/admin/payments/${paymentId}`);
}

function verificationMessage(result: VerificationResult): string {
  switch (result.kind) {
    case "finalized":
      return result.created ? "The provider confirmed the payment — the order was created." : "The provider confirms this payment is paid; its order already exists.";
    case "not_paid":
      return `The provider reports this payment as not paid (${result.status.replace(/_/g, " ")}). Nothing else changed.`;
    case "status_recorded":
      return result.status === "requires_review"
        ? "The provider's latest state was recorded; the payment stays under review."
        : `The provider's latest state was recorded: ${result.status.replace(/_/g, " ")}.`;
    case "requires_review":
      return "Checked with the provider — this payment still needs a manual review.";
    case "payment_conflict":
      return "The provider confirms payment, but the items are no longer available. The payment stays under review.";
    case "not_bound":
      return "This payment never reached the provider, so there is nothing to check.";
  }
}

// Re-check: one authoritative provider lookup through the normal payment
// service (same verification/finalization rules as webhooks and returns).
export async function recheckPayment(paymentId: string, _prev: PaymentActionState, _formData: FormData): Promise<PaymentActionState> {
  void _prev;
  void _formData;
  await requireAdmin();
  if (!uuid.safeParse(paymentId).success) return { error: "Invalid payment." };

  // Read through the admin's own RLS-scoped session: confirms the payment
  // exists and which provider created it.
  const supabase = await createClient();
  const { data: payment, error } = await supabase.from("payments").select("id, provider").eq("id", paymentId).maybeSingle();
  if (error) return { error: "Something went wrong. Please try again." };
  if (!payment) return { error: "This payment no longer exists." };

  try {
    const result = await getPaymentServiceForProvider(payment.provider).verifyPayment({ paymentId });
    logPaymentEvent("info", "admin_payment_recheck", { paymentId, provider: payment.provider, outcome: result.kind });
    revalidatePayments(paymentId);
    return { success: verificationMessage(result) };
  } catch (err) {
    const code = isPaymentError(err) ? err.code : "unknown";
    logPaymentEvent("warn", "admin_payment_recheck_failed", { paymentId, provider: payment.provider, code });
    revalidatePayments(paymentId);
    if (code === "provider_unavailable" || code === "provider_malformed_response") {
      return { error: "Couldn't get a usable answer from the provider. Nothing was changed — try again shortly." };
    }
    if (code === "configuration") return { error: "This provider isn't configured on this server, so the payment can't be checked here." };
    return { error: "The check couldn't be completed. Nothing was changed." };
  }
}

// Retry one recorded authentic event (e.g. one that exhausted automatic
// recovery), using only the identifiers stored when it was received.
export async function retryPaymentEvent(eventId: string, _prev: PaymentActionState, _formData: FormData): Promise<PaymentActionState> {
  void _prev;
  void _formData;
  await requireAdmin();
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };

  try {
    const outcome = await getReconciliationService().retryRecordedEvent(eventId);
    logPaymentEvent("info", "admin_event_retry", { outcome });
    // No revalidation here: a processed event leaves the attention list, and
    // re-rendering now would remove this row together with its result
    // message. The list updates on the next load.
    switch (outcome) {
      case "recovered_event":
        return { success: "Processed — the payment was verified with the provider. Refresh to update the list." };
      case "ignored_event":
        return { success: "Processed — the event doesn't match any payment, so nothing changed. Refresh to update the list." };
      case "event_retry_scheduled":
        return { error: "The retry failed again (the reason is shown on the event). Nothing was changed." };
      case "reconciliation_error":
        return { error: "The retry couldn't be completed. Nothing was changed." };
      case "not_claimable":
        return { error: "This event is already processed, too recent, or a retry is already running." };
    }
  } catch (err) {
    logPaymentEvent("warn", "admin_event_retry_failed", { code: isPaymentError(err) ? err.code : "unknown" });
    return { error: "The retry couldn't be started. Please try again." };
  }
}

// ---- refunds (Payments P7) ------------------------------------------------------

export type RefundActionState = { error: string } | { success: string } | { notice: string } | undefined;

const refundForm = z.strictObject({
  mode: z.enum(["full", "partial"]),
  amount: z.string().trim().max(20).optional(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
  expectedRefundedMinor: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
  confirm: z.literal("yes"),
});

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const REFUND_ERRORS: Record<string, string> = {
  REFUND_NOT_ALLOWED: "This payment can't be refunded in its current state.",
  REFUND_IN_PROGRESS: "Another refund for this payment is still being confirmed with the provider. Nothing new was sent.",
  REFUND_STATE_CHANGED: "The refund history changed since this page was loaded (another refund was recorded). Nothing was sent — review the new totals and try again.",
  REFUND_EXCEEDS_REMAINING: "That's more than is left to refund on this payment. Nothing was sent.",
  REFUND_CURRENCY_MISMATCH: "Refunds must be in the payment's own currency.",
  IDEMPOTENCY_KEY_REUSED: "This form was already used for a different refund. Reload the page and try again.",
  INVALID_REFUND_AMOUNT: "Enter an amount greater than zero.",
  INVALID_NOTE: "The note contains characters that aren't allowed.",
  PAYMENT_PROVIDER_MISMATCH: "This payment belongs to a provider that isn't active on this server.",
  REFUNDS_NOT_SUPPORTED: "Refunds aren't available for this payment's provider.",
};

function refundResultMessage(result: RefundResult): RefundActionState {
  const amount = formatMinor(result.money.amountMinor.toString(), result.money.currency);
  switch (result.kind) {
    case "succeeded":
      return {
        success: result.repeated
          ? `This refund of ${amount} was already completed — nothing was sent twice.`
          : `Refund of ${amount} confirmed by the provider. The order's fulfilment and stock were not changed.`,
      };
    case "pending":
      return { notice: `The provider accepted the refund of ${amount}; it will show as refunded once its records confirm it. Don't issue it again.` };
    case "in_progress":
      return { notice: `This refund of ${amount} is already being processed — nothing was sent twice.` };
    case "requires_reconciliation":
      return {
        notice: `The provider's answer for the refund of ${amount} didn't come through, so it is being confirmed from the provider's records. It will not be sent again, and no other refund can be issued until it settles.`,
      };
    case "failed":
      return { error: `The refund of ${amount} did not go through: ${refundFailureLabel(result.code) ?? "the provider refused it."} No money was returned.` };
    case "review":
      return {
        error: `The provider's refund records don't match Nexora's for this payment, so it was moved to review (${reviewReason(result.reasons[0] ?? null).title}). Nothing else was sent.`,
      };
  }
}

// Issue a refund. The browser sends intent only: full/partial, an amount for
// a partial refund, a reason, an optional internal note, the form's one-time
// key and the refunded total it was showing. The admin's own session records
// the intent (admin_begin_payment_refund checks is_admin() and every amount
// rule against the database), then the payment service sends exactly one
// provider request and confirms it with an authoritative lookup.
export async function requestRefund(paymentId: string, _prev: RefundActionState, formData: FormData): Promise<RefundActionState> {
  void _prev;
  await requireAdmin();
  if (!uuid.safeParse(paymentId).success) return { error: "Invalid payment." };

  const parsed = refundForm.safeParse({
    mode: formData.get("mode"),
    amount: formString(formData, "amount"),
    reason: formData.get("reason"),
    note: formString(formData, "note"),
    idempotencyKey: formData.get("idempotencyKey"),
    expectedRefundedMinor: formData.get("expectedRefundedMinor"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: "Check the refund details: choose a reason, confirm the refund, and keep notes under 500 characters." };
  const input = parsed.data;

  // Read through the admin's own session: the payment's provider, amount and
  // confirmed refunds come from the database, never from the form.
  const supabase = await createClient();
  const { data: payment, error } = await supabase.from("payments").select("id, provider, amount_minor, currency, order_id").eq("id", paymentId).maybeSingle();
  if (error) return { error: "Something went wrong. Please try again." };
  if (!payment) return { error: "This payment no longer exists." };

  let amountMinor: bigint;
  if (input.mode === "full") {
    // "Full" = everything not yet confirmed as refunded, computed here. The
    // database re-checks it against the same total the admin was shown.
    const { data: refunds, error: refundsError } = await supabase.from("payment_refunds").select("amount_minor, status").eq("payment_id", paymentId).limit(500);
    if (refundsError) return { error: "Something went wrong. Please try again." };
    const refunded = (refunds ?? []).filter((r) => r.status === "succeeded").reduce((sum, r) => sum + BigInt(String(r.amount_minor)), BigInt(0));
    amountMinor = BigInt(String(payment.amount_minor)) - refunded;
    if (amountMinor <= BigInt(0)) return { error: REFUND_ERRORS.REFUND_NOT_ALLOWED };
  } else {
    try {
      amountMinor = usdDecimalToMinor(input.amount ?? "");
    } catch (cause) {
      if (cause instanceof MoneyFormatError) return { error: "Enter the amount in dollars and cents, like 12.50." };
      throw cause;
    }
    if (amountMinor <= BigInt(0)) return { error: REFUND_ERRORS.INVALID_REFUND_AMOUNT };
  }

  try {
    const result = await getPaymentServiceForProvider(payment.provider).refundPayment(supabase, {
      paymentId,
      amountMinor: amountMinor.toString(),
      currency: payment.currency,
      reason: input.reason,
      note: input.note || undefined,
      idempotencyKey: input.idempotencyKey,
      expectedRefundedMinor: input.expectedRefundedMinor,
    });
    logPaymentEvent("info", "admin_refund_result", { paymentId, provider: payment.provider, outcome: result.kind, refundId: result.refundId });
    return refundResultMessage(result);
  } catch (err) {
    const dbCode = isPaymentError(err) ? err.details.dbCode : undefined;
    logPaymentEvent("warn", "admin_refund_refused", { paymentId, provider: payment.provider, code: isPaymentError(err) ? err.code : "unknown", dbCode });
    if (dbCode && Object.hasOwn(REFUND_ERRORS, dbCode)) return { error: REFUND_ERRORS[dbCode] };
    if (isPaymentError(err) && err.code === "invalid_input") return { error: "Check the refund details and try again. Nothing was sent." };
    if (isPaymentError(err) && err.code === "configuration") return { error: "Refunds for this payment's provider aren't configured on this server. Nothing was sent." };
    return { error: "The refund couldn't be started. Nothing was sent — please try again." };
  } finally {
    revalidatePayments(paymentId);
    if (payment.order_id) {
      revalidatePath(`/admin/orders/${payment.order_id}`);
      revalidatePath(`/orders/${payment.order_id}`);
    }
  }
}

const reviewInput = z.strictObject({
  resolution: z.enum(REVIEW_RESOLUTIONS),
  note: z.string().max(1000).optional(),
});

// Append an acknowledgement/note. Written by admin_record_payment_review()
// with the admin's own session: the database checks is_admin() again and
// snapshots the current state itself. Never changes the payment.
export async function recordPaymentReview(
  subject: { paymentId: string } | { eventId: string },
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  void _prev;
  await requireAdmin();
  const id = "paymentId" in subject ? subject.paymentId : subject.eventId;
  if (!uuid.safeParse(id).success) return { error: "Invalid item." };

  const rawNote = formData.get("note");
  const parsed = reviewInput.safeParse({
    resolution: formData.get("resolution"),
    note: typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : undefined,
  });
  if (!parsed.success) return { error: "Choose a resolution; notes are limited to 1,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_payment_review", {
    p_payment_id: "paymentId" in subject ? subject.paymentId : null,
    p_event_id: "eventId" in subject ? subject.eventId : null,
    p_resolution: parsed.data.resolution,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    if (error.message === "INVALID_NOTE") return { error: "The note contains characters that aren't allowed." };
    if (error.message === "PAYMENT_NOT_FOUND" || error.message === "PAYMENT_EVENT_NOT_FOUND") return { error: "This item no longer exists." };
    console.error("recordPaymentReview: admin_record_payment_review failed", error.code);
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePayments("paymentId" in subject ? subject.paymentId : undefined);
  return { success: "Review recorded. The payment itself was not changed." };
}
