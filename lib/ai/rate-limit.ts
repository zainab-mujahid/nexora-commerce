import "server-only";

import { createClient } from "@/lib/supabase/server";

// Step 22 Phase 8D — application-level rate limiting for the AI shopping
// assistant Server Action boundary (lib/ai/actions.ts). This is a
// deterministic, pre-emptive gate: it rejects a request BEFORE any
// AI/provider work happens, and is a completely separate concept from
// Phase 8A's provider `rate_limit` category (which only ever classifies a
// real Gemini 429 that already happened, after a call was made). Nothing
// here calls Gemini, retries anything, or touches lib/ai/retry.ts.
//
// ---- Storage (Step 24D) ----
//
// The counters live in Postgres (public.ai_rate_limits), consumed through
// the public.consume_ai_rate_limit() RPC — see its comment in
// supabase/schema.sql. Unlike the previous in-memory Map, that state
// survives Node/PM2 restarts and redeploys, and every app instance shares
// the same counters. The limit (5 per 60s, fixed window) and the window
// logic are defined in that function, not here.
//
// ---- Identity strategy ----
//
// The key is derived inside the database, never passed from here: the RPC
// takes no arguments and uses auth.uid() from the JWT that this request's
// server Supabase client forwards (PostgREST verifies its signature), so
// nothing the browser sends can pick, forge or reset a bucket.
//
// Authenticated requests: one bucket per user ('user:<id>').
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
// ('anonymous') instead of being split per-visitor. This does not
// distinguish one anonymous abuser from another, but it DOES bound the
// worst-case total AI/provider cost anonymous traffic as a whole can
// generate, without trusting a single byte of client-supplied data to
// decide who's who.

export type RateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterMs: number }
  // The limiter itself couldn't be consulted (database/network error or an
  // unexpected response). Callers must treat this as "don't proceed" — see
  // lib/ai/actions.ts. Deliberately carries no error detail.
  | { status: "unavailable" };

// Upper bound for retryAfterMs; must match c_window in
// consume_ai_rate_limit().
const WINDOW_MS = 60_000;

// Consumes one rate-limit unit for the current request's caller. Call
// exactly once per assistant request — never from inside a retry loop.
export async function consumeAiRateLimit(): Promise<RateLimitResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_ai_rate_limit");
    if (error) {
      return { status: "unavailable" };
    }

    // A RETURNS TABLE function comes back as an array of rows.
    const row: unknown = Array.isArray(data) ? data[0] : null;
    if (typeof row !== "object" || row === null || !("allowed" in row) || typeof row.allowed !== "boolean") {
      return { status: "unavailable" };
    }
    if (row.allowed) {
      return { status: "allowed" };
    }

    const retryAfterMs = "retry_after_ms" in row ? Number(row.retry_after_ms) : NaN;
    return {
      status: "limited",
      retryAfterMs: Number.isFinite(retryAfterMs) ? Math.min(Math.max(retryAfterMs, 1), WINDOW_MS) : WINDOW_MS,
    };
  } catch {
    return { status: "unavailable" };
  }
}
