import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import {
  eventErrorLabel,
  eventOutcomeLabel,
  formatMinor,
  parseEventFilter,
  parsePage,
  parseView,
  PAYMENT_VIEW_LABEL,
  PAYMENT_VIEWS,
  paymentStatusBadgeClass,
  paymentStatusLabel,
  providerStateLabel,
  resolutionLabel,
  reviewReason,
  shortProviderId,
  shortRef,
  type EventFilter,
  type PaymentView,
} from "@/lib/admin/payment-presentation";
import {
  getAttentionCounts,
  listAdminPayments,
  listAttentionEvents,
  type AdminEventRow,
  type AdminPaymentRow,
  type Paged,
} from "@/lib/admin/payment-queries";

import { RetryEventButton } from "./payment-actions";

export const metadata: Metadata = {
  title: "Payments",
};

const EMPTY_MESSAGE: Record<PaymentView, string> = {
  attention: "Nothing needs review right now.",
  conflicts: "No payment conflicts.",
  disputes: "No reversed, voided or disputed payments.",
  processing: "No payments are processing.",
  paid: "No paid payments yet.",
  partially_refunded: "No partially refunded payments.",
  refunded: "No refunded payments.",
  all: "No payments yet.",
  events: "",
};

function href(view: PaymentView, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ view, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  return `/admin/payments?${params.toString()}`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const query = await searchParams;
  const view = parseView(query.view);
  const page = parsePage(query.page);
  const eventFilter = parseEventFilter(query.events);
  const counts = await getAttentionCounts();

  const summary: { view: PaymentView; label: string; count: number; extra?: Record<string, string> }[] = [
    { view: "attention", label: "Payments needing review", count: counts.review },
    { view: "conflicts", label: "Paid, items unavailable", count: counts.conflicts },
    { view: "disputes", label: "Reversed · voided · disputed", count: counts.disputes },
    { view: "events", label: "Events past automatic retries", count: counts.exhaustedEvents, extra: { events: "exhausted" } },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader description="Exceptions, provider states and recovery for online payments. Refunds are issued in the payment provider's dashboard, not here.">
        Payments
      </AdminPageHeader>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <li key={s.view}>
            <Link
              href={href(s.view, s.extra)}
              aria-current={view === s.view ? "page" : undefined}
              className={`card card-interactive flex h-full flex-col gap-1 p-4 ${view === s.view ? "ring-1 ring-foreground/30" : ""}`}
            >
              <span className={`text-2xl font-semibold tabular-nums ${s.count > 0 ? "text-warning" : "text-foreground"}`}>{s.count}</span>
              <span className="text-xs text-muted">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul aria-label="Payment views" className="flex w-max gap-2">
          {PAYMENT_VIEWS.map((v) => (
            <li key={v}>
              <Link
                href={href(v)}
                aria-current={v === view ? "page" : undefined}
                className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  v === view ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:border-input hover:text-foreground"
                }`}
              >
                {PAYMENT_VIEW_LABEL[v]}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {view === "events" ? (
        <EventsSection filter={eventFilter} page={page} />
      ) : (
        <PaymentsSection view={view} page={page} />
      )}
    </div>
  );
}

async function PaymentsSection({ view, page }: { view: Exclude<PaymentView, "events">; page: number }) {
  const result = await listAdminPayments(view, page);
  const showReason = view === "attention" || view === "conflicts" || view === "disputes";
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="payments-heading" className="flex flex-col gap-3">
        <h2 id="payments-heading" className="text-base font-semibold">
          {PAYMENT_VIEW_LABEL[view]} <span className="font-normal text-muted tabular-nums">· {result.total}</span>
        </h2>
        {result.rows.length === 0 ? (
          <EmptyState message={result.total > 0 ? "This page is past the end of the list." : EMPTY_MESSAGE[view]} />
        ) : (
          <PaymentsTable rows={result.rows} showReason={showReason} />
        )}
        <Pager paged={result} hrefFor={(p) => href(view, { page: p })} />
      </section>
      {view === "attention" && page === 1 && <AttentionEvents />}
    </div>
  );
}

function PaymentsTable({ rows, showReason }: { rows: AdminPaymentRow[]; showReason: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table data-table-stack">
        <thead>
          <tr>
            <th>Payment</th>
            <th>Customer</th>
            <th className="cell-num">Amount</th>
            <th>Payment status</th>
            <th>Order</th>
            {showReason && <th>Why it needs attention</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const provider = providerStateLabel(row.providerState);
            const reason = reviewReason(row.failureCode);
            return (
              <tr key={row.id}>
                <td>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs">#{shortRef(row.id)}</span>
                    <span className="text-xs text-muted tabular-nums">{when(row.createdAt)}</span>
                  </span>
                </td>
                <td data-label="Customer" className="[overflow-wrap:anywhere]">
                  {row.customer.name ?? "Customer"} <span className="font-mono text-xs text-subtle">{shortRef(row.customer.id)}</span>
                </td>
                <td data-label="Amount" className="cell-num font-medium">{formatMinor(row.amountMinor, row.currency)}</td>
                <td data-label="Payment status">
                  <span className="flex flex-col items-end gap-1 sm:items-start">
                    <span className={paymentStatusBadgeClass(row.status)}>{paymentStatusLabel(row.status)}</span>
                    {provider && provider !== paymentStatusLabel(row.status) && (
                      <span className="text-xs text-muted">Provider: {provider}</span>
                    )}
                  </span>
                </td>
                <td data-label="Order">
                  {row.order ? (
                    <span className="flex flex-wrap items-center justify-end gap-1.5 sm:justify-start">
                      <span className="font-mono text-xs">#{shortRef(row.order.id)}</span>
                      <span className={`capitalize ${orderStatusBadgeClass(row.order.status)}`}>{row.order.status}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">No order{row.sessionStatus === "payment_conflict" ? " · conflict" : ""}</span>
                  )}
                </td>
                {showReason && (
                  <td data-label="Why" className="max-w-xs text-xs leading-relaxed">
                    <span className="flex flex-col items-end gap-1 text-right sm:items-start sm:text-left">
                      <span className="font-medium text-foreground">{row.status === "requires_review" ? reason.title : (provider ?? "Provider state")}</span>
                      {row.review &&
                        (row.review.current ? (
                          <span className="badge">{resolutionLabel(row.review.resolution)}</span>
                        ) : (
                          <span className="text-muted">Changed since last review</span>
                        ))}
                    </span>
                  </td>
                )}
                <td className="cell-actions">
                  <Link href={`/admin/payments/${row.id}`} className="btn btn-secondary btn-sm" aria-label={`View payment ${shortRef(row.id)}`}>
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function AttentionEvents() {
  const result = await listAttentionEvents("exhausted", 1);
  return (
    <section aria-labelledby="attention-events-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attention-events-heading" className="text-base font-semibold">
          Provider events past automatic retries <span className="font-normal text-muted tabular-nums">· {result.total}</span>
        </h2>
        {result.total > result.rows.length && (
          <Link href={href("events", { events: "exhausted" })} className="link-action text-sm">
            See all
          </Link>
        )}
      </div>
      {result.rows.length === 0 ? <EmptyState message="Every recorded provider event was processed." /> : <EventsTable rows={result.rows} />}
    </section>
  );
}

async function EventsSection({ filter, page }: { filter: EventFilter; page: number }) {
  const result = await listAttentionEvents(filter, page);
  const tabs: { key: EventFilter; label: string }[] = [
    { key: "exhausted", label: "Past automatic retries" },
    { key: "retrying", label: "Still retrying" },
  ];
  return (
    <section aria-labelledby="events-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="events-heading" className="text-base font-semibold">
          Provider events not yet processed <span className="font-normal text-muted tabular-nums">· {result.total}</span>
        </h2>
        <ul className="flex gap-2">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link
                href={href("events", { events: t.key })}
                aria-current={t.key === filter ? "page" : undefined}
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                  t.key === filter ? "border-foreground text-foreground" : "border-border text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted">
        Authentic webhook events whose processing didn&apos;t finish. Retrying uses only the identifiers recorded when the event arrived and
        always re-checks the payment with the provider. Events are never deleted.
      </p>
      {result.rows.length === 0 ? (
        <EmptyState
          message={
            result.total > 0
              ? "This page is past the end of the list."
              : filter === "exhausted"
                ? "No events are past their automatic retries."
                : "No events are waiting for a retry."
          }
        />
      ) : (
        <EventsTable rows={result.rows} />
      )}
      <Pager paged={result} hrefFor={(p) => href("events", { events: filter, page: p })} />
    </section>
  );
}

function EventsTable({ rows }: { rows: AdminEventRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table data-table-stack">
        <thead>
          <tr>
            <th>Event</th>
            <th>Payment</th>
            <th className="cell-num">Attempts</th>
            <th>Last outcome</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const resolved = !!e.payment?.verifiedAfterEvent;
            return (
              <tr key={e.id}>
                <td>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs">{e.eventType}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {e.provider} · {when(e.receivedAt)}
                    </span>
                  </span>
                </td>
                <td data-label="Payment">
                  {e.payment ? (
                    <Link href={`/admin/payments/${e.payment.id}`} className="link-action font-mono text-xs">
                      #{shortRef(e.payment.id)} · {paymentStatusLabel(e.payment.status)}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">
                      {e.providerPaymentId ? `No matching payment (${shortProviderId(e.providerPaymentId)})` : "No payment named"}
                    </span>
                  )}
                </td>
                <td data-label="Attempts" className="cell-num">{e.attempts}</td>
                <td data-label="Last outcome" className="text-xs">
                  <span className="flex flex-col items-end gap-0.5 sm:items-start">
                    <span>{eventOutcomeLabel(e.outcome)}</span>
                    {e.errorCode && <span className="text-muted">{eventErrorLabel(e.errorCode)}</span>}
                  </span>
                </td>
                <td data-label="Status" className="text-xs">
                  {resolved ? (
                    <span className="badge badge-success">Payment verified since</span>
                  ) : e.review?.current ? (
                    <span className="badge">{resolutionLabel(e.review.resolution)}</span>
                  ) : (
                    <span className="badge badge-warning">{e.exhausted ? "Needs a manual retry" : "Retrying automatically"}</span>
                  )}
                </td>
                <td className="cell-actions">
                  <RetryEventButton eventId={e.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pager<T>({ paged, hrefFor }: { paged: Paged<T>; hrefFor: (page: number) => string }) {
  if (paged.pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      {paged.page > 1 ? (
        <Link href={hrefFor(paged.page - 1)} className="btn btn-secondary btn-sm" rel="prev">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted tabular-nums">
        Page {Math.min(paged.page, paged.pageCount)} of {paged.pageCount}
      </span>
      {paged.page < paged.pageCount ? (
        <Link href={hrefFor(paged.page + 1)} className="btn btn-secondary btn-sm" rel="next">
          Next
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
