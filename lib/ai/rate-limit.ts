import "server-only";

// Step 22 Phase 8D — application-level rate limiting for the AI shopping
// assistant Server Action boundary (lib/ai/actions.ts). This is a
// deterministic, pre-emptive gate: it rejects a request BEFORE any
// AI/provider work happens, and is a completely separate concept from
// Phase 8A's provider `rate_limit` category (which only ever classifies a
// real Gemini 429 that already happened, after a call was made). Nothing
// here calls Gemini, retries anything, or touches lib/ai/retry.ts.
//
// ---- Identity strategy ----
//
// Authenticated requests: keyed by the real, server-verified `user.id`
// from lib/auth/dal.ts's getUser() (which re-validates against Supabase
// Auth itself, not just whatever a cookie claims) — trustworthy, cannot
// be spoofed by the client.
//
// Anonymous requests: this codebase has NO verified trustworthy per-client
// identity signal for an anonymous visitor. Checked directly before
// choosing this design:
//   - proxy.ts (this project's middleware) never reads, sets, or trusts
//     any x-forwarded-for/x-real-ip header — there is no confirmed reverse
//     proxy in front of this app that would strip/normalize a
//     client-supplied value before it reaches the Next.js server. Trusting
//     such a header here would mean trusting the client to self-report an
//     identity — exactly the "invent a secure IP source" the Phase 8D
//     brief explicitly warns against.
//   - A server-issued anonymous cookie was considered and rejected for
//     this phase: it would need new cookie-issuing plumbing (e.g. in
//     proxy.ts), and even then a client that simply declines to send it
//     back gets a fresh identity — and therefore fresh quota — on every
//     request, so it would not actually stop a determined abuser, only
//     raise a small amount of friction, at a disproportionate cost in new
//     surface area for this phase.
// Given that, every anonymous request shares ONE global bucket
// ("anonymous") instead of being split per-visitor. This does not
// distinguish one anonymous abuser from another, but it DOES bound the
// worst-case total AI/provider cost anonymous traffic as a whole can
// generate, without trusting a single byte of client-supplied data to
// decide who's who — there is nothing here for a malicious client to
// spoof, because the bucket key never depends on anything they send.
//
// ---- Storage / deployment model ----
//
// A plain in-memory Map, scoped to this one Node process. EXPLICITLY NOT
// distributed production enforcement: it resets on every restart/deploy,
// and if this app ever runs as more than one server instance/process
// behind a load balancer, each instance enforces its own independent
// counter — the effective limit becomes (MAX_REQUESTS_PER_WINDOW) x
// (instance count), not one shared bound. This is a real, acknowledged
// limitation of this phase, not something hidden — see the Phase 8D
// report for the recommended upgrade path (a small counter table in this
// project's existing Supabase Postgres database, which is already
// multi-instance-shared infrastructure, rather than a new external
// service like Redis/Upstash).

// Deliberately small and conservative: this bounds request RATE (abuse
// protection), not total daily AI budget — that is Phase 8E's job, not
// this phase's. A normal shopping conversation rarely sends more than a
// couple of messages within any one minute while reading responses; 5 per
// 60s comfortably allows that while meaningfully blocking rapid automated
// abuse. Both constants are simple, named, adjustable values — not
// scientifically derived — and are never influenced by anything the
// client sends.
const MAX_REQUESTS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

type WindowState = { count: number; windowStart: number };

// Module-level — intentionally the ONE shared store for this process; see
// the deployment-model note above for exactly what that does and does not
// guarantee.
const buckets = new Map<string, WindowState>();

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

// Pure with respect to its explicit inputs — `now`, the backing store, and
// the limit/window themselves are all injectable, purely so this is
// deterministically unit-testable without waiting for a real 60-second
// window or mutating shared module state across test cases. Real callers
// (lib/ai/actions.ts) never pass these — nothing client-reachable can
// reach this function's parameters at all, since it's only ever called
// from other server-only code with a server-derived identity string, never
// with client-supplied count/window/bypass values.
export function checkRateLimit(
  identity: string,
  options?: {
    now?: number;
    store?: Map<string, WindowState>;
    maxRequests?: number;
    windowMs?: number;
  },
): RateLimitDecision {
  const now = options?.now ?? Date.now();
  const store = options?.store ?? buckets;
  const maxRequests = options?.maxRequests ?? MAX_REQUESTS_PER_WINDOW;
  const windowMs = options?.windowMs ?? WINDOW_MS;

  const existing = store.get(identity);

  if (!existing || now - existing.windowStart >= windowMs) {
    // First request from this identity, or its previous window has fully
    // elapsed: start a fresh window.
    store.set(identity, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, retryAfterMs: windowMs - (now - existing.windowStart) };
  }

  existing.count += 1;
  return { allowed: true };
}
