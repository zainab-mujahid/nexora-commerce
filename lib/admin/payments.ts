"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { isPaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getReconciliationService } from "@/lib/payments/reconciliation";
import { getPaymentServiceForProvider, type VerificationResult } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";

import { REVIEW_RESOLUTIONS } from "./payment-presentation";

// Admin payment-operations actions (Payments P6). Only safe, idempotent
// operations exist here: re-verify with the provider, retry a recorded event,
// and append a review note. There is deliberately no action that sets a
// payment status, an amount or a provider reference, issues a refund, or
// deletes history. Every action re-checks the admin role itself — Server
// Actions are reachable by direct POST, not only through the admin pages —
// and takes nothing from the browser but an id (plus a closed-set resolution
// and a note for review notes).

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
