import "server-only";

import { cache } from "react";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { RECONCILE_LIMITS } from "@/lib/payments/reconciliation";
import { getPaymentProviderByName } from "@/lib/payments/registry";
import { createClient } from "@/lib/supabase/server";

import {
  ATTENTION_PROVIDER_STATES,
  eventErrorLabel,
  eventOutcomeLabel,
  formatMinor,
  PAGE_SIZE,
  providerStateLabel,
  refundFailureLabel,
  refundStatusLabel,
  resolutionLabel,
  type EventFilter,
  type PaymentView,
} from "./payment-presentation";

// Admin reads for payment operations (Payments P6/P7). Every query runs with
// the ADMIN's own session: RLS (payments/checkout_sessions/payment_events/
// payment_review_notes/payment_refunds select policies) is what grants access,
// via is_admin() — the server's payments secret key is not used for any read
// here. Internal payment columns (failure codes, provider state, verification
// times) are not readable by the customer role, so they are read through the
// admin-only admin_payments view (P7). Each query also re-checks the admin
// role (the layout already does; Server Components can be reached in other
// ways). Lists are paginated and bounded.

const MAX_EVENTS_ON_DETAIL = 50;
const MAX_NOTES_ON_DETAIL = 50;

const uuid = z.uuid();
const SAFE_PROVIDER_ID = /^[A-Za-z0-9_.:-]{1,255}$/;

export type ReviewState = {
  resolution: string;
  createdAt: string;
  // The note still describes the payment's/event's current state.
  current: boolean;
};

export type AdminPaymentRow = {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  amountMinor: string;
  currency: string;
  status: string;
  failureCode: string | null;
  providerState: string | null;
  createdAt: string;
  updatedAt: string;
  order: { id: string; status: string; paymentStatus: string } | null;
  sessionStatus: string | null;
  customer: { id: string; name: string | null };
  review: ReviewState | null;
};

export type Paged<T> = { rows: T[]; total: number; page: number; pageCount: number };

type PaymentRowDb = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  amount_minor: string | number;
  currency: string;
  status: string;
  failure_code: string | null;
  provider_state: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  order: { id: string; status: string; payment_status: string } | { id: string; status: string; payment_status: string }[] | null;
  session: { status: string } | { status: string }[] | null;
};

// PostgREST infers embedded to-one relations as arrays without generated types.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function pageRange(page: number) {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

// A page past the end makes PostgREST answer 416 (PGRST103) instead of an
// empty list: report it as an empty page with the real total.
async function withPastEnd<T>(
  query: PromiseLike<{ data: T[] | null; error: { code?: string } | null; count: number | null }>,
  countOnly: () => PromiseLike<{ error: { code?: string } | null; count: number | null }>,
): Promise<{ data: T[] | null; error: { code?: string } | null; count: number | null }> {
  const result = await query;
  if (result.error?.code !== "PGRST103") return result;
  const { error, count } = await countOnly();
  return { data: [], error, count };
}

async function db() {
  await requireAdmin();
  return createClient();
}

async function customerNames(supabase: Awaited<ReturnType<typeof createClient>>, userIds: string[]) {
  const ids = [...new Set(userIds)].filter((id) => uuid.safeParse(id).success);
  if (ids.length === 0) return new Map<string, string | null>();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) throw new Error("Failed to load customers");
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string | null)?.trim() || null]));
}

function reviewStateFrom(
  note: { resolution: string; created_at: string; snapshot_status: string; snapshot_code: string | null; snapshot_provider_state: string | null } | undefined,
  current: { status: string; code: string | null; providerState: string | null },
): ReviewState | null {
  if (!note) return null;
  return {
    resolution: note.resolution,
    createdAt: note.created_at,
    current:
      note.snapshot_status === current.status &&
      (note.snapshot_code ?? null) === current.code &&
      (note.snapshot_provider_state ?? null) === current.providerState,
  };
}

const PAYMENT_LIST_SELECT =
  "id, provider, provider_payment_id, amount_minor, currency, status, failure_code, provider_state, created_at, updated_at, user_id, order:orders(id, status, payment_status)";

export const listAdminPayments = cache(async (view: Exclude<PaymentView, "events" | "refunds">, page: number): Promise<Paged<AdminPaymentRow>> => {
  const supabase = await db();
  const select =
    view === "conflicts"
      ? `${PAYMENT_LIST_SELECT}, session:checkout_sessions!inner(status)`
      : `${PAYMENT_LIST_SELECT}, session:checkout_sessions(status)`;
  const build = (head = false) => {
    let query = supabase.from("admin_payments").select(select, { count: "exact", head });
    switch (view) {
      case "attention":
        query = query.eq("status", "requires_review");
        break;
      case "conflicts":
        query = query.eq("session.status", "payment_conflict");
        break;
      case "disputes":
        query = query.in("provider_state", [...ATTENTION_PROVIDER_STATES]);
        break;
      case "processing":
        query = query.in("status", ["pending", "processing"]);
        break;
      case "paid":
      case "partially_refunded":
      case "refunded":
        query = query.eq("status", view);
        break;
      case "all":
        break;
    }
    return query;
  };
  const { from, to } = pageRange(page);
  const { data, error, count } = await withPastEnd(
    build().order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    () => build(true),
  );
  if (error) {
    console.error("listAdminPayments: query failed", error.code);
    throw new Error("Failed to load payments");
  }
  const rows = (data ?? []) as unknown as PaymentRowDb[];

  const names = await customerNames(supabase, rows.map((r) => r.user_id));
  const latest = new Map<string, Parameters<typeof reviewStateFrom>[0]>();
  if (rows.length > 0) {
    const { data: notes, error: notesError } = await supabase
      .from("payment_review_notes")
      .select("payment_id, resolution, created_at, snapshot_status, snapshot_code, snapshot_provider_state")
      .in("payment_id", rows.map((r) => r.id))
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE * 10);
    if (notesError) throw new Error("Failed to load review notes");
    for (const n of notes ?? []) if (!latest.has(n.payment_id as string)) latest.set(n.payment_id as string, n as never);
  }

  const total = count ?? rows.length;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r) => {
      const order = one(r.order);
      return {
        id: r.id,
        provider: r.provider,
        providerPaymentId: r.provider_payment_id,
        amountMinor: String(r.amount_minor),
        currency: r.currency,
        status: r.status,
        failureCode: r.failure_code,
        providerState: r.provider_state,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        order: order ? { id: order.id, status: order.status, paymentStatus: order.payment_status } : null,
        sessionStatus: one(r.session)?.status ?? null,
        customer: { id: r.user_id, name: names.get(r.user_id) ?? null },
        review: reviewStateFrom(latest.get(r.id), { status: r.status, code: r.failure_code, providerState: r.provider_state }),
      };
    }),
  };
});

// ---- events needing attention ------------------------------------------------

export type AdminEventRow = {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  outcome: string;
  errorCode: string | null;
  attempts: number;
  exhausted: boolean;
  receivedAt: string;
  processedAt: string | null;
  nextAttemptAt: string | null;
  providerPaymentId: string | null;
  payment: { id: string; status: string; orderId: string | null; verifiedAfterEvent: boolean } | null;
  review: ReviewState | null;
};

type EventRowDb = {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payment_id: string | null;
  outcome: string;
  details: Record<string, unknown> | null;
  process_attempts: number;
  received_at: string;
  processed_at: string | null;
  next_attempt_at: string | null;
};

const EVENT_SELECT = "id, provider, provider_event_id, event_type, payment_id, outcome, details, process_attempts, received_at, processed_at, next_attempt_at";

// Authentic events that were recorded but never processed successfully:
// "exhausted" stopped automatic recovery (P5 attempt limit); "retrying" is
// still being retried automatically.
export const listAttentionEvents = cache(async (filter: EventFilter, page: number): Promise<Paged<AdminEventRow>> => {
  const supabase = await db();
  const max = RECONCILE_LIMITS.eventMaxAttempts;
  const settled = new Date(Date.now() - RECONCILE_LIMITS.eventMinAgeSeconds * 1000).toISOString();
  const build = (head = false) => {
    const query = supabase
      .from("payment_events")
      .select(EVENT_SELECT, { count: "exact", head })
      .eq("signature_valid", true)
      .in("outcome", ["received", "error"]);
    return filter === "exhausted"
      ? query.gte("process_attempts", max)
      : // Fresh 'received' events are still with the webhook's own processing.
        query.lt("process_attempts", max).or(`outcome.eq.error,received_at.lte.${settled}`);
  };
  const { from, to } = pageRange(page);
  const { data, error, count } = await withPastEnd(
    build().order("received_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    () => build(true),
  );
  if (error) {
    console.error("listAttentionEvents: query failed", error.code);
    throw new Error("Failed to load payment events");
  }
  const rows = (data ?? []) as unknown as EventRowDb[];
  const enriched = await enrichEvents(supabase, rows);
  const total = count ?? rows.length;
  return { total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows: enriched };
});

async function enrichEvents(supabase: Awaited<ReturnType<typeof createClient>>, rows: EventRowDb[]): Promise<AdminEventRow[]> {
  const max = RECONCILE_LIMITS.eventMaxAttempts;
  const providerIdOf = (r: EventRowDb) => {
    const v = r.details?.provider_payment_id;
    return typeof v === "string" && SAFE_PROVIDER_ID.test(v) ? v : null;
  };

  const paymentIds = rows.map((r) => r.payment_id).filter((v): v is string => !!v && uuid.safeParse(v).success);
  const providerIds = rows.map(providerIdOf).filter((v): v is string => !!v);
  type P = { id: string; status: string; order_id: string | null; provider: string; provider_payment_id: string | null; last_checked_at: string | null };
  let payments: P[] = [];
  if (paymentIds.length > 0 || providerIds.length > 0) {
    const ors: string[] = [];
    if (paymentIds.length > 0) ors.push(`id.in.(${paymentIds.join(",")})`);
    if (providerIds.length > 0) ors.push(`provider_payment_id.in.(${providerIds.map((v) => `"${v}"`).join(",")})`);
    const { data, error } = await supabase
      .from("admin_payments")
      .select("id, status, order_id, provider, provider_payment_id, last_checked_at")
      .or(ors.join(","))
      .limit(PAGE_SIZE * 2);
    if (error) throw new Error("Failed to load payments for events");
    payments = (data ?? []) as P[];
  }

  const latest = new Map<string, Parameters<typeof reviewStateFrom>[0]>();
  if (rows.length > 0) {
    const { data: notes, error: notesError } = await supabase
      .from("payment_review_notes")
      .select("payment_event_id, resolution, created_at, snapshot_status, snapshot_code, snapshot_provider_state")
      .in("payment_event_id", rows.map((r) => r.id))
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE * 10);
    if (notesError) throw new Error("Failed to load review notes");
    for (const n of notes ?? []) if (!latest.has(n.payment_event_id as string)) latest.set(n.payment_event_id as string, n as never);
  }

  return rows.map((r) => {
    const providerPaymentId = providerIdOf(r);
    const p =
      payments.find((x) => r.payment_id && x.id === r.payment_id) ??
      payments.find((x) => providerPaymentId && x.provider === r.provider && x.provider_payment_id === providerPaymentId) ??
      null;
    const code = typeof r.details?.code === "string" ? r.details.code.slice(0, 64) : null;
    return {
      id: r.id,
      provider: r.provider,
      providerEventId: r.provider_event_id,
      eventType: r.event_type,
      outcome: r.outcome,
      errorCode: code,
      attempts: r.process_attempts,
      exhausted: r.process_attempts >= max,
      receivedAt: r.received_at,
      processedAt: r.processed_at,
      nextAttemptAt: r.next_attempt_at,
      providerPaymentId,
      payment: p
        ? {
            id: p.id,
            status: p.status,
            orderId: p.order_id,
            // The event only ever asks "verify this payment"; a later
            // authoritative check already answered it.
            verifiedAfterEvent: !!p.last_checked_at && new Date(p.last_checked_at).getTime() > new Date(r.received_at).getTime(),
          }
        : null,
      review: reviewStateFrom(latest.get(r.id), { status: r.outcome, code: String(r.process_attempts), providerState: null }),
    };
  });
}

// ---- counts for the header ---------------------------------------------------

export const getAttentionCounts = cache(async () => {
  const supabase = await db();
  const [review, conflicts, disputes, exhausted, refunds] = await Promise.all([
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "requires_review"),
    supabase.from("checkout_sessions").select("id", { count: "exact", head: true }).eq("status", "payment_conflict"),
    supabase.from("admin_payments").select("id", { count: "exact", head: true }).in("provider_state", [...ATTENTION_PROVIDER_STATES]),
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("signature_valid", true)
      .in("outcome", ["received", "error"])
      .gte("process_attempts", RECONCILE_LIMITS.eventMaxAttempts),
    openRefundsQuery(supabase, true),
  ]);
  for (const r of [review, conflicts, disputes, exhausted, refunds]) if (r.error) throw new Error("Failed to load payment counts");
  return {
    review: review.count ?? 0,
    conflicts: conflicts.count ?? 0,
    disputes: disputes.count ?? 0,
    exhaustedEvents: exhausted.count ?? 0,
    refundsToReconcile: refunds.count ?? 0,
  };
});

// ---- one payment ---------------------------------------------------------------

export type TimelineEntry = {
  at: string;
  // verified: authoritative provider lookup result; event: recorded provider
  // event (a hint); outcome: what Nexora did with it; review: admin note;
  // nexora: internal lifecycle step.
  kind: "verified" | "event" | "outcome" | "review" | "nexora";
  title: string;
  detail?: string;
};

export type AdminPaymentDetail = {
  payment: {
    id: string;
    provider: string;
    providerPaymentId: string | null;
    amountMinor: string;
    currency: string;
    status: string;
    failureCode: string | null;
    failureMessage: string | null;
    providerState: string | null;
    providerStateAt: string | null;
    lastCheckedAt: string | null;
    paidAt: string | null;
    createdAt: string;
    updatedAt: string;
    display: { brand?: string; last4?: string };
  };
  customer: { id: string; name: string | null };
  session: { id: string; status: string; reservedUntil: string; createdAt: string; items: { name: string; quantity: number; subtotal: string }[] } | null;
  order: { id: string; status: string; paymentStatus: string; createdAt: string; fromThisPayment: boolean } | null;
  attempts: { id: string; status: string; providerPaymentId: string | null; createdAt: string; isThis: boolean }[];
  events: (AdminEventRow & { kind: "provider" | "internal"; evidence: { label: string; value: string }[] })[];
  notes: { id: string; resolution: string; note: string | null; createdAt: string; by: string | null; snapshotStatus: string }[];
  review: ReviewState | null;
  refunds: RefundSummary;
  timeline: TimelineEntry[];
};

export const getAdminPaymentDetail = cache(async (paymentId: string): Promise<AdminPaymentDetail | null> => {
  if (!uuid.safeParse(paymentId).success) return null;
  const supabase = await db();

  const { data: p, error } = await supabase
    .from("admin_payments")
    .select(
      "id, checkout_session_id, user_id, provider, provider_payment_id, amount_minor, currency, status, failure_code, failure_message, provider_state, provider_state_at, last_checked_at, paid_at, created_at, updated_at, display_summary, order_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error("Failed to load payment");
  if (!p) return null;

  const providerPaymentId = typeof p.provider_payment_id === "string" && SAFE_PROVIDER_ID.test(p.provider_payment_id) ? p.provider_payment_id : null;
  const eventsQuery = supabase.from("payment_events").select(EVENT_SELECT).eq("signature_valid", true);
  const [sessionRes, attemptsRes, eventsRes, notesRes, names, refundsRes] = await Promise.all([
    supabase
      .from("checkout_sessions")
      .select("id, status, reserved_until, created_at, order_id, items:checkout_session_items(product_name, quantity, subtotal)")
      .eq("id", p.checkout_session_id)
      .maybeSingle(),
    supabase.from("payments").select("id, status, provider_payment_id, created_at").eq("checkout_session_id", p.checkout_session_id).order("created_at").limit(20),
    (providerPaymentId
      ? eventsQuery.or(`payment_id.eq.${p.id},details->>provider_payment_id.eq.${providerPaymentId}`)
      : eventsQuery.eq("payment_id", p.id)
    )
      .order("received_at", { ascending: false })
      .limit(MAX_EVENTS_ON_DETAIL),
    supabase
      .from("payment_review_notes")
      .select("id, resolution, note, created_at, reviewed_by, snapshot_status, snapshot_code, snapshot_provider_state")
      .eq("payment_id", p.id)
      .order("created_at", { ascending: false })
      .limit(MAX_NOTES_ON_DETAIL),
    customerNames(supabase, [p.user_id]),
    supabase
      .from("payment_refunds")
      .select(REFUND_SELECT)
      .eq("payment_id", p.id)
      .order("created_at", { ascending: false })
      .limit(MAX_REFUNDS_ON_DETAIL),
  ]);
  if (sessionRes.error || attemptsRes.error || eventsRes.error || notesRes.error || refundsRes.error) throw new Error("Failed to load payment details");

  const session = sessionRes.data;
  const orderId = (p.order_id as string | null) ?? (session?.order_id as string | null) ?? null;
  let order: AdminPaymentDetail["order"] = null;
  if (orderId) {
    const { data: o, error: oe } = await supabase.from("orders").select("id, status, payment_status, created_at").eq("id", orderId).maybeSingle();
    if (oe) throw new Error("Failed to load order");
    if (o) order = { id: o.id, status: o.status, paymentStatus: o.payment_status, createdAt: o.created_at, fromThisPayment: p.order_id === o.id };
  }

  const notes = notesRes.data ?? [];
  const refundRows = (refundsRes.data ?? []) as unknown as RefundRowDb[];
  const reviewerNames = await customerNames(supabase, [
    ...notes.map((n) => n.reviewed_by as string).filter(Boolean),
    ...refundRows.map((r) => r.requested_by).filter((v): v is string => !!v),
  ]);
  const eventRows = (eventsRes.data ?? []) as unknown as EventRowDb[];
  const events = (await enrichEvents(supabase, eventRows)).map((e, i) => ({
    ...e,
    kind: (e.providerEventId.startsWith("internal:") ? "internal" : "provider") as "provider" | "internal",
    evidence: evidenceOf(eventRows[i].details),
  }));

  const display = (p.display_summary ?? {}) as Record<string, unknown>;
  const detail: AdminPaymentDetail = {
    payment: {
      id: p.id,
      provider: p.provider,
      providerPaymentId: p.provider_payment_id,
      amountMinor: String(p.amount_minor),
      currency: p.currency,
      status: p.status,
      failureCode: p.failure_code,
      failureMessage: p.failure_message,
      providerState: p.provider_state,
      providerStateAt: p.provider_state_at,
      lastCheckedAt: p.last_checked_at,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      display: {
        brand: typeof display.brand === "string" ? display.brand : undefined,
        last4: typeof display.last4 === "string" && /^[0-9]{4}$/.test(display.last4) ? display.last4 : undefined,
      },
    },
    customer: { id: p.user_id, name: names.get(p.user_id) ?? null },
    session: session
      ? {
          id: session.id,
          status: session.status,
          reservedUntil: session.reserved_until,
          createdAt: session.created_at,
          items: ((session.items ?? []) as { product_name: string; quantity: number; subtotal: string }[]).map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            subtotal: String(i.subtotal),
          })),
        }
      : null,
    order,
    attempts: (attemptsRes.data ?? []).map((a) => ({
      id: a.id,
      status: a.status,
      providerPaymentId: a.provider_payment_id,
      createdAt: a.created_at,
      isThis: a.id === p.id,
    })),
    events,
    notes: notes.map((n) => ({
      id: n.id,
      resolution: n.resolution,
      note: n.note,
      createdAt: n.created_at,
      by: n.reviewed_by ? (reviewerNames.get(n.reviewed_by) ?? "Admin") : null,
      snapshotStatus: n.snapshot_status,
    })),
    review: reviewStateFrom(notes[0] as never, { status: p.status, code: p.failure_code, providerState: p.provider_state }),
    refunds: refundSummary(
      {
        provider: p.provider,
        providerPaymentId: p.provider_payment_id,
        status: p.status,
        failureCode: p.failure_code,
        providerState: p.provider_state,
        paidAt: p.paid_at,
        amountMinor: String(p.amount_minor),
      },
      refundRows.map((r) => refundFromDb(r, reviewerNames)),
    ),
    timeline: [],
  };
  detail.timeline = buildTimeline(detail);
  return detail;
});

// Safe, allow-listed evidence from an event's details (identifiers, codes,
// expected vs received values) — never a payload.
function evidenceOf(details: Record<string, unknown> | null): { label: string; value: string }[] {
  if (!details) return [];
  const out: { label: string; value: string }[] = [];
  const str = (k: string) => (typeof details[k] === "string" || typeof details[k] === "number" ? String(details[k]).slice(0, 120) : null);
  const pairs: [string, string][] = [
    ["reason", "Reason"],
    ["expected_amount_minor", "Expected amount (minor units)"],
    ["received_amount_minor", "Received amount (minor units)"],
    ["expected_currency", "Expected currency"],
    ["received_currency", "Received currency"],
    ["expected_reference", "Expected reference"],
    ["received_reference", "Received reference"],
    ["environment", "Environment"],
  ];
  for (const [key, label] of pairs) {
    const v = str(key);
    if (v) out.push({ label, value: v });
  }
  if (typeof details.account_matches === "boolean") out.push({ label: "Merchant account matches", value: details.account_matches ? "Yes" : "No" });
  return out;
}

function buildTimeline(d: AdminPaymentDetail): TimelineEntry[] {
  const t: TimelineEntry[] = [];
  if (d.session) t.push({ at: d.session.createdAt, kind: "nexora", title: "Checkout started — stock reserved" });
  t.push({ at: d.payment.createdAt, kind: "nexora", title: "Payment attempt opened" });
  if (d.payment.paidAt) t.push({ at: d.payment.paidAt, kind: "verified", title: "Payment confirmed by provider lookup" });
  if (d.order?.fromThisPayment) t.push({ at: d.order.createdAt, kind: "nexora", title: `Order #${d.order.id.slice(0, 8)} created` });
  for (const e of d.events) {
    if (e.kind === "internal" && e.eventType === "internal.refund_review_cleared") {
      t.push({ at: e.receivedAt, kind: "verified", title: "Provider's refund records match again — review lifted automatically", detail: e.evidence.map((x) => `${x.label}: ${x.value}`).join(" · ") || undefined });
    } else if (e.kind === "internal") {
      t.push({ at: e.receivedAt, kind: "verified", title: "Provider lookup did not match this payment", detail: e.evidence.map((x) => `${x.label}: ${x.value}`).join(" · ") || undefined });
    } else {
      t.push({ at: e.receivedAt, kind: "event", title: `Provider event received: ${e.eventType}` });
      if (e.processedAt) t.push({ at: e.processedAt, kind: "outcome", title: `Nexora outcome: ${eventOutcomeLabel(e.outcome)}`, detail: eventErrorLabel(e.errorCode) ?? undefined });
    }
  }
  if (d.payment.providerStateAt && d.payment.providerState) {
    t.push({ at: d.payment.providerStateAt, kind: "verified", title: `Provider last reported: ${providerStateLabel(d.payment.providerState)}` });
  }
  for (const n of d.notes) t.push({ at: n.createdAt, kind: "review", title: `Review: ${resolutionLabel(n.resolution)}`, detail: n.note ?? undefined });
  for (const r of d.refunds.rows) {
    const amount = formatMinor(r.amountMinor, r.currency);
    t.push({
      at: r.createdAt,
      kind: r.origin === "provider" ? "verified" : "nexora",
      title: r.origin === "provider" ? `Refund of ${amount} found at the provider` : `Refund of ${amount} requested by ${r.requestedBy ?? "an admin"}`,
    });
    if (r.completedAt && r.origin === "nexora") {
      t.push({
        at: r.completedAt,
        kind: "verified",
        title: `Refund of ${amount}: ${refundStatusLabel(r.status).toLowerCase()}`,
        detail: r.status === "failed" ? (refundFailureLabel(r.failureCode) ?? undefined) : undefined,
      });
    }
  }
  return t.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// ---- order -> payment link (admin order page) ---------------------------------

export const getAdminOrderPayment = cache(async (orderId: string) => {
  if (!uuid.safeParse(orderId).success) return null;
  const supabase = await db();
  const { data, error } = await supabase
    .from("admin_payments")
    .select("id, status, provider, provider_state, amount_minor, currency")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Failed to load order payment");
  if (!data) return null;
  const { data: refunds, error: refundsError } = await supabase
    .from("payment_refunds")
    .select("amount_minor, status")
    .eq("payment_id", data.id)
    .limit(MAX_REFUNDS_ON_DETAIL);
  if (refundsError) throw new Error("Failed to load order refunds");
  const refunded = (refunds ?? []).filter((r) => r.status === "succeeded").reduce((sum, r) => sum + BigInt(String(r.amount_minor)), BigInt(0));
  const paid = BigInt(String(data.amount_minor));
  return {
    id: data.id as string,
    status: data.status as string,
    provider: data.provider as string,
    providerState: data.provider_state as string | null,
    currency: data.currency as string,
    paidMinor: paid.toString(),
    refundedMinor: refunded.toString(),
    remainingMinor: (paid > refunded ? paid - refunded : BigInt(0)).toString(),
    refundOpen: (refunds ?? []).some((r) => r.status === "requested" || r.status === "requires_reconciliation"),
  };
});

// ---- refunds (Payments P7) ------------------------------------------------------

const MAX_REFUNDS_ON_DETAIL = 100;
const REFUND_SELECT =
  "id, payment_id, provider_refund_id, amount_minor, currency, status, origin, reason, note, requested_by, failure_code, submitted_at, completed_at, created_at, reconcile_attempts";
// A refund still 'requested' this long after it was sent is overdue: the
// provider answers synchronously, so it needs confirming from its records.
const OVERDUE_REQUEST_MS = 2 * 60 * 1000;

type RefundRowDb = {
  id: string;
  payment_id: string;
  provider_refund_id: string | null;
  amount_minor: string | number;
  currency: string;
  status: string;
  origin: string;
  reason: string | null;
  note: string | null;
  requested_by: string | null;
  failure_code: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  reconcile_attempts: number;
};

export type AdminRefundRow = {
  id: string;
  paymentId: string;
  providerRefundId: string | null;
  amountMinor: string;
  currency: string;
  status: string;
  origin: "nexora" | "provider";
  reason: string | null;
  note: string | null;
  requestedBy: string | null;
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  attempts: number;
};

function refundFromDb(r: RefundRowDb, names: Map<string, string | null>): AdminRefundRow {
  return {
    id: r.id,
    paymentId: r.payment_id,
    providerRefundId: typeof r.provider_refund_id === "string" && SAFE_PROVIDER_ID.test(r.provider_refund_id) ? r.provider_refund_id : null,
    amountMinor: String(r.amount_minor),
    currency: r.currency,
    status: r.status,
    origin: r.origin === "provider" ? "provider" : "nexora",
    reason: r.reason,
    note: r.note,
    requestedBy: r.requested_by ? (names.get(r.requested_by) ?? "Admin") : null,
    failureCode: r.failure_code,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    attempts: r.reconcile_attempts,
  };
}

export type RefundEligibility = { eligible: true } | { eligible: false; reason: string };

export type RefundSummary = {
  rows: AdminRefundRow[];
  currency: string;
  paidMinor: string;
  // Confirmed (succeeded) refunds only.
  refundedMinor: string;
  remainingMinor: string;
  open: AdminRefundRow | null;
  eligibility: RefundEligibility;
};

// Mirrors admin_begin_payment_refund()'s rules so the panel is only offered
// when the database would accept it; the database still decides.
function refundSummary(
  payment: {
    provider: string;
    providerPaymentId: string | null;
    status: string;
    failureCode: string | null;
    providerState: string | null;
    paidAt: string | null;
    amountMinor: string;
  },
  rows: AdminRefundRow[],
): RefundSummary {
  const paid = BigInt(payment.amountMinor);
  const refunded = rows.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + BigInt(r.amountMinor), BigInt(0));
  const remaining = paid > refunded ? paid - refunded : BigInt(0);
  const open = rows.find((r) => r.status === "requested" || r.status === "requires_reconciliation") ?? null;
  const duplicate = payment.status === "requires_review" && payment.failureCode === "DUPLICATE_PAYMENT";

  let eligibility: RefundEligibility = { eligible: true };
  if (!payment.providerPaymentId || !payment.paidAt || !(payment.status === "paid" || payment.status === "partially_refunded" || duplicate)) {
    eligibility = {
      eligible: false,
      reason:
        payment.status === "refunded"
          ? "This payment has been refunded in full."
          : payment.status === "requires_review"
            ? "Payments under review can't be refunded here while the review reason stands — except a confirmed duplicate charge."
            : "Only payments the provider confirmed as paid can be refunded.",
    };
  } else if (payment.providerState === "reversed" || payment.providerState === "voided" || payment.providerState === "disputed") {
    eligibility = { eligible: false, reason: "The provider reports this payment as reversed, voided or disputed, so it can't be refunded here." };
  } else if (open) {
    eligibility = { eligible: false, reason: "A refund is still being confirmed with the provider. Another refund can be issued once it settles." };
  } else if (remaining === BigInt(0)) {
    eligibility = { eligible: false, reason: "Nothing is left to refund on this payment." };
  } else if (!providerSupportsRefunds(payment.provider)) {
    eligibility = { eligible: false, reason: "Refunds for this payment's provider aren't available on this server." };
  }

  return {
    rows,
    currency: "USD",
    paidMinor: paid.toString(),
    refundedMinor: refunded.toString(),
    remainingMinor: remaining.toString(),
    open,
    eligibility,
  };
}

function providerSupportsRefunds(name: string): boolean {
  try {
    return typeof getPaymentProviderByName(name).createRefund === "function";
  } catch {
    return false;
  }
}

function openRefundsQuery(supabase: Awaited<ReturnType<typeof createClient>>, head: boolean) {
  const overdue = new Date(Date.now() - OVERDUE_REQUEST_MS).toISOString();
  return supabase
    .from("payment_refunds")
    .select(REFUND_SELECT, { count: "exact", head })
    .or(`status.eq.requires_reconciliation,and(status.eq.requested,submitted_at.lte.${overdue})`);
}

// Refunds whose provider outcome is still open past the normal answer time:
// being confirmed automatically (scheduled reconciliation), or exhausted.
export const listRefundsToReconcile = cache(async (page: number): Promise<Paged<AdminRefundRow & { exhausted: boolean }>> => {
  const supabase = await db();
  const { from, to } = pageRange(page);
  const { data, error, count } = await withPastEnd(
    openRefundsQuery(supabase, false).order("created_at", { ascending: true }).order("id").range(from, to),
    () => openRefundsQuery(supabase, true),
  );
  if (error) {
    console.error("listRefundsToReconcile: query failed", error.code);
    throw new Error("Failed to load refunds");
  }
  const rows = (data ?? []) as unknown as RefundRowDb[];
  const names = await customerNames(supabase, rows.map((r) => r.requested_by).filter((v): v is string => !!v));
  const total = count ?? rows.length;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r) => ({ ...refundFromDb(r, names), exhausted: r.reconcile_attempts >= RECONCILE_LIMITS.refundMaxAttempts })),
  };
});
