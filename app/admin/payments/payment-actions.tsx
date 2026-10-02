"use client";

import { useActionState } from "react";

import { REVIEW_RESOLUTION_LABEL, REVIEW_RESOLUTIONS } from "@/lib/admin/payment-presentation";
import { recheckPayment, recordPaymentReview, retryPaymentEvent, type PaymentActionState } from "@/lib/admin/payments";

// Admin payment-operation controls. Each one submits only an id (and, for a
// review note, a closed-set resolution + free text); the Server Actions
// re-check the admin role and decide everything server-side.

function Result({ state }: { state: PaymentActionState }) {
  if (!state) return null;
  const error = "error" in state;
  return (
    <p role={error ? "alert" : "status"} className={`text-xs leading-relaxed ${error ? "text-red-600 dark:text-red-400" : "text-success"}`}>
      {error ? state.error : state.success}
    </p>
  );
}

export function RecheckPaymentButton({ paymentId, disabled }: { paymentId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(recheckPayment.bind(null, paymentId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending || disabled} className="btn btn-secondary self-start">
        {pending ? "Checking with provider…" : "Re-check with provider"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function RetryEventButton({ eventId, size = "sm" }: { eventId: string; size?: "sm" | "md" }) {
  const [state, action, pending] = useActionState(retryPaymentEvent.bind(null, eventId), undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1.5 text-right sm:items-start sm:text-left">
      <button type="submit" disabled={pending} className={`btn btn-secondary ${size === "sm" ? "btn-sm" : ""}`}>
        {pending ? "Retrying…" : "Retry processing"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ReviewForm({
  subject,
  compact = false,
}: {
  subject: { paymentId: string } | { eventId: string };
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(recordPaymentReview.bind(null, subject), undefined);
  const id = "paymentId" in subject ? subject.paymentId : subject.eventId;
  return (
    <form action={action} className="flex flex-col gap-3 text-left">
      <label className="flex flex-col gap-1.5">
        <span className="field-label">Resolution</span>
        <select name="resolution" required defaultValue="acknowledged" className="field" disabled={pending}>
          {REVIEW_RESOLUTIONS.map((value) => (
            <option key={value} value={value}>
              {REVIEW_RESOLUTION_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <label className="flex flex-col gap-1.5">
          <span className="field-label">
            Note <span className="font-normal text-subtle">(internal, optional)</span>
          </span>
          <textarea
            name="note"
            rows={3}
            maxLength={1000}
            disabled={pending}
            aria-describedby={`review-help-${id}`}
            className="field min-h-20 resize-y"
          />
        </label>
      )}
      <p id={`review-help-${id}`} className="text-xs text-muted">
        Recording a review never changes the payment, the order or stock.
      </p>
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm self-start">
        {pending ? "Saving…" : "Record review"}
      </button>
      <Result state={state} />
    </form>
  );
}
