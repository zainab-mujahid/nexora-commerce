"use client";

import { useActionState, useState } from "react";

import {
  formatMinor,
  REFUND_REASON_LABEL,
  refundFailureLabel,
  refundReasonLabel,
  refundStatusBadgeClass,
  refundStatusLabel,
  shortProviderId,
} from "@/lib/admin/payment-presentation";
import type { AdminRefundRow, RefundSummary } from "@/lib/admin/payment-queries";
import { requestRefund, type RefundActionState } from "@/lib/admin/payments";
import { REFUND_REASONS, type RefundReason } from "@/lib/payments/types";

// Refund panel for one payment (Payments P7). Shows the verified totals and
// history; when the payment is refundable, a two-step form (review, then an
// explicit confirmation) submits INTENT only — full/partial, an amount, a
// reason, an internal note, the form's one-time key and the refunded total on
// screen. The Server Action and the database decide everything else.

// Same shape the server accepts (whole dollars, up to two decimals).
const AMOUNT = /^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/;

function toMinor(value: string): bigint | null {
  const m = AMOUNT.exec(value.trim());
  if (!m) return null;
  return BigInt(m[1]) * BigInt(100) + BigInt((m[2]?.slice(1) ?? "").padEnd(2, "0"));
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Result({ state }: { state: RefundActionState }) {
  if (!state) return null;
  const kind = "error" in state ? "error" : "success" in state ? "success" : "notice";
  const text = "error" in state ? state.error : "success" in state ? state.success : state.notice;
  const tone =
    kind === "error"
      ? "border-danger/40 text-red-700 dark:text-red-300"
      : kind === "success"
        ? "border-success/40 text-success"
        : "border-warning/40 text-foreground";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-md border bg-fill/40 px-3 py-2 text-sm leading-relaxed ${tone}`}>
      {text}
    </p>
  );
}

export function RefundPanel({
  paymentId,
  providerLabel,
  summary,
  idempotencyKey,
}: {
  paymentId: string;
  providerLabel: string;
  summary: RefundSummary;
  // One per rendered form: a double submit or replay maps to the same refund.
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(requestRefund.bind(null, paymentId), undefined);
  const { currency } = summary;

  return (
    <section id="refunds" aria-labelledby="refunds-heading" className="card flex scroll-mt-24 flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="refunds-heading" className="text-base font-semibold">Refunds</h2>
        <span className="text-xs text-muted">Totals count only refunds the provider confirmed</span>
      </div>

      <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        {[
          ["Paid", summary.paidMinor],
          ["Refunded", summary.refundedMinor],
          ["Left to refund", summary.remainingMinor],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-lg border border-border bg-fill/40 px-3 py-2.5">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatMinor(value, currency)}</dd>
          </div>
        ))}
      </dl>

      <Result state={state} />

      {summary.open && (
        <p role="status" className="rounded-md border border-warning/40 bg-fill/40 px-3 py-2 text-sm leading-relaxed">
          A refund of <span className="font-medium tabular-nums">{formatMinor(summary.open.amountMinor, currency)}</span> is being confirmed with{" "}
          {providerLabel}. It will not be sent again; use &ldquo;Re-check with provider&rdquo; to settle it now.
        </p>
      )}

      {summary.eligibility.eligible ? (
        // Keyed by the one-time key: after any submission the page re-renders
        // with a fresh key and the form starts clean.
        <RefundForm
          key={idempotencyKey}
          action={action}
          pending={pending}
          providerLabel={providerLabel}
          currency={currency}
          remainingMinor={summary.remainingMinor}
          refundedMinor={summary.refundedMinor}
          idempotencyKey={idempotencyKey}
        />
      ) : (
        <p className="text-sm text-muted">{summary.eligibility.reason}</p>
      )}

      <RefundHistory rows={summary.rows} currency={currency} />
    </section>
  );
}

function RefundForm({
  action,
  pending,
  providerLabel,
  currency,
  remainingMinor,
  refundedMinor,
  idempotencyKey,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  providerLabel: string;
  currency: string;
  remainingMinor: string;
  refundedMinor: string;
  idempotencyKey: string;
}) {
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<RefundReason | "">("");
  const [note, setNote] = useState("");

  const remaining = BigInt(remainingMinor);
  const partialMinor = mode === "partial" ? toMinor(amount) : null;
  const amountError =
    mode !== "partial" || amount.trim() === ""
      ? null
      : partialMinor === null
        ? "Enter dollars and cents, like 12.50."
        : partialMinor <= BigInt(0)
          ? "Enter an amount greater than zero."
          : partialMinor > remaining
            ? `At most ${formatMinor(remainingMinor, currency)} can be refunded.`
            : null;
  const refundMinor = mode === "full" ? remaining : partialMinor;
  const ready = !!reason && refundMinor !== null && refundMinor > BigInt(0) && refundMinor <= remaining && !amountError;
  const display = refundMinor !== null ? formatMinor(refundMinor.toString(), currency) : "";

  return (
    <form action={action} className="flex flex-col gap-4" aria-describedby="refund-warning">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="amount" value={mode === "partial" ? amount.trim() : ""} />
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="note" value={note.trim()} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="expectedRefundedMinor" value={refundedMinor} />

      <p id="refund-warning" className="rounded-md border border-border bg-fill/40 px-3 py-2 text-xs leading-relaxed text-muted">
        A refund returns money to the customer&apos;s card through {providerLabel}. It does not cancel the order, change its fulfilment or put
        items back in stock — do those from the order, deliberately, if they&apos;re right.
      </p>

      {step === "edit" ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label mb-1.5">Refund</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["full", "partial"] as const).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    mode === m ? "border-foreground/60 bg-fill/50" : "border-border hover:border-input"
                  }`}
                >
                  <input type="radio" name="refund-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5 accent-current" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{m === "full" ? "Full refund" : "Partial refund"}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {m === "full" ? `Everything left: ${formatMinor(remainingMinor, currency)}` : "Choose an amount"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "partial" && (
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Amount ({currency})</span>
              <span className="relative block">
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                  $
                </span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  maxLength={12}
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby="refund-amount-help"
                  className="field pl-7 tabular-nums"
                />
              </span>
              <span id="refund-amount-help" className={`text-xs ${amountError ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
                {amountError ?? `Up to ${formatMinor(remainingMinor, currency)}.`}
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="field-label">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as RefundReason | "")} required className="field">
              <option value="" disabled>
                Choose a reason
              </option>
              {REFUND_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REFUND_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="field-label">
              Note <span className="font-normal text-subtle">(internal, optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              aria-describedby="refund-note-help"
              className="field min-h-16 resize-y"
            />
            <span id="refund-note-help" className="text-xs text-muted">
              Kept in Nexora&apos;s refund history only — never shown to the customer or sent to {providerLabel}.
            </span>
          </label>

          <button type="button" disabled={!ready} onClick={() => setStep("confirm")} className="btn btn-primary self-start">
            Review refund
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-danger/40 p-4">
          <p className="text-sm font-semibold">Confirm refund</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Amount</dt>
            <dd className="font-semibold tabular-nums">
              {display} <span className="text-xs font-normal text-muted">{mode === "full" ? "(full remaining amount)" : "(partial)"}</span>
            </dd>
            <dt className="text-muted">Reason</dt>
            <dd>{refundReasonLabel(reason || null)}</dd>
            {note.trim() && (
              <>
                <dt className="text-muted">Note</dt>
                <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{note.trim()}</dd>
              </>
            )}
          </dl>
          <p className="text-xs leading-relaxed text-muted">
            {display} will be sent back to the customer&apos;s card. A refund can&apos;t be undone from Nexora.
          </p>
          <input type="hidden" name="confirm" value="yes" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} aria-disabled={pending} className="btn btn-danger">
              {pending ? "Refunding…" : `Refund ${display}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setStep("edit")} className="btn btn-secondary">
              Back
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function RefundHistory({ rows, currency }: { rows: AdminRefundRow[]; currency: string }) {
  if (rows.length === 0) return <p className="border-t border-border pt-4 text-xs text-muted">No refunds yet.</p>;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">History</h3>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 border-b border-border pb-3 text-sm last:border-b-0 last:pb-0">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tabular-nums">{formatMinor(r.amountMinor, r.currency || currency)}</span>
                <span className={refundStatusBadgeClass(r.status)}>{refundStatusLabel(r.status)}</span>
              </span>
              <span className="text-xs text-muted tabular-nums">{when(r.createdAt)}</span>
            </span>
            <span className="text-xs text-muted">
              {r.origin === "provider" ? "Found in the provider's records (not issued from Nexora)" : `${refundReasonLabel(r.reason)} · by ${r.requestedBy ?? "an admin"}`}
              {r.providerRefundId ? (
                <>
                  {" · "}
                  <span className="font-mono">{shortProviderId(r.providerRefundId)}</span>
                </>
              ) : null}
            </span>
            {r.status === "failed" || r.status === "requires_reconciliation" ? (
              <span className="text-xs text-muted">{refundFailureLabel(r.failureCode)}</span>
            ) : null}
            {r.note && <span className="whitespace-pre-line text-xs text-muted [overflow-wrap:anywhere]">Note: {r.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
