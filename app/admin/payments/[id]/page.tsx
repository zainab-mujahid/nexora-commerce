import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { formatPrice } from "@/lib/catalog/format";
import {
  ATTENTION_PROVIDER_STATES,
  eventErrorLabel,
  eventOutcomeLabel,
  formatMinor,
  paymentStatusBadgeClass,
  paymentStatusLabel,
  providerStateLabel,
  resolutionLabel,
  reviewReason,
  shortProviderId,
  shortRef,
} from "@/lib/admin/payment-presentation";
import { getAdminPaymentDetail, type TimelineEntry } from "@/lib/admin/payment-queries";

import { RecheckPaymentButton, RetryEventButton, ReviewForm } from "../payment-actions";
import { RefundPanel } from "../refund-panel";

export const metadata: Metadata = {
  title: "Payment details",
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  completed: "Completed — order created",
  expired: "Expired — reservation released",
  cancelled: "Cancelled — reservation released",
  payment_conflict: "Payment conflict — no order",
};

const PROVIDER_LABEL: Record<string, string> = { safepay: "Safepay" };

const TIMELINE_KIND: Record<TimelineEntry["kind"], { label: string; className: string }> = {
  verified: { label: "Verified with provider", className: "badge badge-success" },
  event: { label: "Provider event", className: "badge badge-info" },
  outcome: { label: "Nexora outcome", className: "badge" },
  review: { label: "Admin review", className: "badge badge-warning" },
  nexora: { label: "Nexora", className: "badge" },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function AdminPaymentDetailPage({ params }: PageProps<"/admin/payments/[id]">) {
  const { id } = await params;
  const detail = await getAdminPaymentDetail(id);
  if (!detail) notFound();

  const { payment, order, session } = detail;
  const inReview = payment.status === "requires_review";
  const providerAttention = !!payment.providerState && (ATTENTION_PROVIDER_STATES as readonly string[]).includes(payment.providerState);
  const reason = reviewReason(payment.failureCode);
  const providerState = providerStateLabel(payment.providerState);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/payments", label: "Payments" }}
        description={
          <>
            {payment.provider} · opened {when(payment.createdAt)}
          </>
        }
        action={<span className={`${paymentStatusBadgeClass(payment.status)} px-3 py-1 text-sm`}>{paymentStatusLabel(payment.status)}</span>}
      >
        Payment #{shortRef(payment.id)}
      </AdminPageHeader>

      {(inReview || providerAttention) && (
        <section aria-labelledby="attention-heading" className="card flex flex-col gap-2 border-warning/40 p-5 text-sm">
          <h2 id="attention-heading" className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="badge badge-warning">Needs attention</span>
            {inReview ? reason.title : `Provider reports: ${providerState}`}
          </h2>
          <p className="max-w-3xl leading-relaxed text-muted">{inReview ? reason.detail : reviewReason(`PROVIDER_${payment.providerState?.toUpperCase()}`).detail}</p>
          {detail.review && (
            <p className="text-xs text-muted">
              {detail.review.current
                ? `Reviewed ${when(detail.review.createdAt)} — ${resolutionLabel(detail.review.resolution)}.`
                : `Last reviewed ${when(detail.review.createdAt)}; the payment has changed since then.`}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="summary-heading" className="card flex flex-col gap-4 p-5 sm:p-6">
            <h2 id="summary-heading" className="text-base font-semibold">Payment</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Fact label="Amount">
                <span className="font-medium tabular-nums">{formatMinor(payment.amountMinor, payment.currency)}</span> <span className="text-xs text-muted">{payment.currency}</span>
              </Fact>
              <Fact label="Nexora status">
                <span className={paymentStatusBadgeClass(payment.status)}>{paymentStatusLabel(payment.status)}</span>
              </Fact>
              <Fact label="Provider last reported">
                {providerState ? (
                  <>
                    {providerState} <span className="text-xs text-muted">· {when(payment.providerStateAt)}</span>
                  </>
                ) : (
                  <span className="text-muted">Not recorded yet</span>
                )}
              </Fact>
              <Fact label="Last verified with provider">{when(payment.lastCheckedAt)}</Fact>
              <Fact label="Provider reference">
                {payment.providerPaymentId ? <span className="font-mono text-xs">{payment.providerPaymentId}</span> : <span className="text-muted">Never reached the provider</span>}
              </Fact>
              <Fact label="Nexora reference">
                <span className="font-mono text-xs">{payment.id}</span>
              </Fact>
              <Fact label="Customer">
                {detail.customer.name ?? "Customer"} <span className="font-mono text-xs text-subtle">{shortRef(detail.customer.id)}</span>
              </Fact>
              <Fact label="Card">
                {payment.display.brand || payment.display.last4 ? (
                  <>
                    {payment.display.brand ?? "Card"}
                    {payment.display.last4 ? ` •••• ${payment.display.last4}` : ""}
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Fact>
              <Fact label="Paid at">{when(payment.paidAt)}</Fact>
              {payment.failureCode && (
                <Fact label="Review / failure code">
                  <span className="font-mono text-xs">{payment.failureCode}</span>
                </Fact>
              )}
            </dl>
          </section>

          <RefundPanel
            paymentId={payment.id}
            providerLabel={PROVIDER_LABEL[payment.provider] ?? payment.provider}
            summary={detail.refunds}
            idempotencyKey={randomUUID()}
          />

          <section aria-labelledby="order-heading" className="card flex flex-col gap-3 p-5 text-sm sm:p-6">
            <h2 id="order-heading" className="text-base font-semibold">Order &amp; fulfilment</h2>
            {order ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/orders/${order.id}`} className="link-action font-mono text-xs">
                    Order #{shortRef(order.id)}
                  </Link>
                  <span className={`capitalize ${orderStatusBadgeClass(order.status)}`}>{order.status}</span>
                  <span className="text-xs text-muted">Order payment: {paymentStatusLabel(order.paymentStatus)}</span>
                </div>
                {!order.fromThisPayment && (
                  <p className="text-xs font-medium">This order was created by another payment for the same checkout, not by this one.</p>
                )}
                <p className="text-xs leading-relaxed text-muted">
                  Fulfilment status and stock are never changed by payments. Refunds, reversals and disputes don&apos;t cancel the order or return
                  items to stock — do that from the order, deliberately, if it&apos;s right.
                </p>
                {order.status === "cancelled" && BigInt(detail.refunds.remainingMinor) > BigInt(0) && order.fromThisPayment && (
                  <p className="rounded-md border border-warning/40 bg-fill/40 px-3 py-2 text-xs leading-relaxed">
                    This order is cancelled but {formatMinor(detail.refunds.remainingMinor, payment.currency)} of its payment hasn&apos;t been
                    refunded. Cancelling never returns money — use the refund panel if the customer should get it back.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted">
                No order was created from this payment
                {session?.status === "payment_conflict" ? " — the checkout is in a payment conflict." : "."}
              </p>
            )}
            {session && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted">
                  Checkout #{shortRef(session.id)} · {SESSION_STATUS_LABEL[session.status] ?? session.status} · hold until {when(session.reservedUntil)}
                </p>
                <ul className="flex flex-col gap-1">
                  {session.items.map((item, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {item.name} <span className="text-muted">&times; {item.quantity}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatPrice(item.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.attempts.length > 1 && (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium">Payment attempts for this checkout</p>
                <ul className="flex flex-col gap-1">
                  {detail.attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                      {a.isThis ? (
                        <span className="font-mono">#{shortRef(a.id)} (this)</span>
                      ) : (
                        <Link href={`/admin/payments/${a.id}`} className="link-action font-mono">
                          #{shortRef(a.id)}
                        </Link>
                      )}
                      <span className={paymentStatusBadgeClass(a.status)}>{paymentStatusLabel(a.status)}</span>
                      <span className="text-muted">{shortProviderId(a.providerPaymentId) ?? "not sent to provider"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section aria-labelledby="timeline-heading" className="card flex flex-col gap-4 p-5 sm:p-6">
            <h2 id="timeline-heading" className="text-base font-semibold">Timeline</h2>
            <ol className="flex flex-col gap-3">
              {detail.timeline.map((t, i) => (
                <li key={i} className="flex flex-col gap-1 border-l-2 border-border pl-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={TIMELINE_KIND[t.kind].className}>{TIMELINE_KIND[t.kind].label}</span>
                    <span className="text-xs text-muted tabular-nums">{when(t.at)}</span>
                  </span>
                  <span className="[overflow-wrap:anywhere]">{t.title}</span>
                  {t.detail && <span className="text-xs text-muted [overflow-wrap:anywhere]">{t.detail}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="actions-heading" className="card flex flex-col gap-3 p-5 text-sm">
            <h2 id="actions-heading" className="text-base font-semibold">Verify</h2>
            <p className="text-xs leading-relaxed text-muted">
              Asks the provider for this payment&apos;s current state and applies the normal verification rules. Safe to repeat.
            </p>
            <RecheckPaymentButton paymentId={payment.id} disabled={!payment.providerPaymentId} />
          </section>

          <section aria-labelledby="review-heading" className="card flex flex-col gap-3 p-5 text-sm">
            <h2 id="review-heading" className="text-base font-semibold">Review</h2>
            <ReviewForm subject={{ paymentId: payment.id }} />
            {detail.notes.length > 0 && (
              <ul className="flex flex-col gap-2 border-t border-border pt-3">
                {detail.notes.map((n) => (
                  <li key={n.id} className="flex flex-col gap-0.5 text-xs">
                    <span className="font-medium">{resolutionLabel(n.resolution)}</span>
                    {n.note && <span className="whitespace-pre-line text-muted [overflow-wrap:anywhere]">{n.note}</span>}
                    <span className="text-subtle">
                      {n.by ?? "Admin"} · {when(n.createdAt)} · status then: {paymentStatusLabel(n.snapshotStatus)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="events-heading" className="card flex flex-col gap-3 p-5 text-sm">
            <h2 id="events-heading" className="text-base font-semibold">Recorded events</h2>
            {detail.events.length === 0 ? (
              <p className="text-xs text-muted">No provider events recorded for this payment.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {detail.events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs [overflow-wrap:anywhere]">{e.kind === "internal" ? (e.eventType === "internal.refund_review_cleared" ? "Refund review lifted" : "Verification check") : e.eventType}</span>
                      <span className="text-xs text-muted tabular-nums">{when(e.receivedAt)}</span>
                    </span>
                    <span className="text-xs">
                      {eventOutcomeLabel(e.outcome)}
                      {e.errorCode ? ` — ${eventErrorLabel(e.errorCode)}` : ""}
                      {e.attempts > 0 ? ` · ${e.attempts} recovery attempt${e.attempts === 1 ? "" : "s"}` : ""}
                    </span>
                    {e.evidence.length > 0 && (
                      <dl className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs text-muted">
                        {e.evidence.map((x) => (
                          <div key={x.label} className="flex flex-wrap gap-1">
                            <dt>{x.label}:</dt>
                            <dd className="font-mono [overflow-wrap:anywhere]">{x.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {(e.outcome === "received" || e.outcome === "error") && e.kind === "provider" && <RetryEventButton eventId={e.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
