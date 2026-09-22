import "server-only";

import { classifyAiError, type AiErrorCategory } from "./errors";
import { logAiEvent, type AiOperation } from "./log";

// Step 22 Phase 8B — bounded retry for transient provider operations, built
// on top of Phase 8A's classifyAiError(). Deterministic, bounded,
// iterative (no recursion, no unbounded loop) — this file contains the
// ONLY retry logic in lib/ai/*; it is not duplicated in intent.ts or
// recommend.ts, both of which call the one already-wrapped
// generateStructuredJson()/generateEmbedding() in lib/ai/client.ts.

// Only genuinely transient failures are retried. invalid_response
// (Gemini's own output failed our validation/allowlist contract) and
// internal (anything else, including our own bugs) are never retried —
// retrying either would either paper over a real defect or repeat a call
// that is guaranteed to fail the same way again.
const RETRYABLE_CATEGORIES: ReadonlySet<AiErrorCategory> = new Set([
  "rate_limit",
  "provider_unavailable",
  "network",
]);

// "Intentionally small" per the Phase 8B brief: each AI request can
// consume real quota/cost, and this project has already hit the Gemini
// free-tier daily cap more than once during earlier manual testing. 3
// INCLUDES the initial attempt (attempt 1 = original call, attempt 2 =
// first retry, attempt 3 = final retry) — never more than 2 actual retries
// for any single provider operation.
const DEFAULT_MAX_ATTEMPTS = 3;
// Exponential backoff base and ceiling, in milliseconds. Doubling per
// retry: 300ms before retry 1, 600ms before retry 2 (with
// DEFAULT_MAX_ATTEMPTS = 3, there is no delay after retry 2 — that's the
// final attempt, its failure is thrown immediately). MAX_DELAY_MS caps
// this so a larger maxAttempts (if ever configured) can't grow the wait
// unboundedly.
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 4000;
// Symmetric jitter: the final delay is the exponential value +/- up to
// this fraction of it (e.g. 0.5 -> anywhere in [0.5x, 1.5x] of the
// exponential value, before the MAX_DELAY_MS cap and a floor of 0 are
// applied). Smooths out synchronized retry storms across concurrent
// requests without making delays wildly unpredictable.
const DEFAULT_JITTER_RATIO = 0.5;

export type AiRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  // Injectable purely for deterministic, non-sleeping tests — see
  // lib/ai/retry.ts's own test suite. Real callers (lib/ai/client.ts)
  // never pass these; nothing browser-reachable can reach this function's
  // options at all, since it is only ever called from other server-only
  // code several layers below any Server Action boundary.
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff with symmetric jitter, capped. `attempt` is the
// 1-based number of the attempt that just failed (so the delay computed
// is for the retry that follows it): attempt 1 -> ~baseDelayMs, attempt 2
// -> ~baseDelayMs*2, etc., before the maxDelayMs cap.
function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const jitter = exponential * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.min(maxDelayMs, Math.round(exponential + jitter)));
}

// Wraps a single transient provider operation with bounded, classified
// retry. Deliberately generic over `T` and takes a zero-argument thunk —
// callers decide exactly what "one provider operation" means; see
// lib/ai/client.ts for the actual placement (wrapping only the raw
// ai.models.{generateContent,embedContent}() call, never the surrounding
// response-shape checks or JSON parsing, so a validation-style failure in
// that surrounding code is never retried by this helper at all — it never
// even reaches classifyAiError()).
//
// `context.operation` (Step 22 Phase 8F): a small, closed-set, server-
// controlled label identifying WHICH provider operation is being retried,
// used only for the structured retry-observability events below. Required,
// not optional, so no call site can silently retry unobserved — every
// current caller (lib/ai/client.ts) passes a fixed string literal; nothing
// browser-reachable can ever influence this value.
//
// On a retryable classification (rate_limit/provider_unavailable/network)
// that is not yet the last attempt: logs a safe "ai_retry" event (operation,
// attempt number, broad category — never the caught error's message/stack/
// cause), then waits (with backoff+jitter) and tries again. On a non-
// retryable classification (invalid_response/internal): re-throws the exact
// error it caught, unmodified, with no retry-specific log (this was never a
// retry — the caller's own operation-level logging, not this file, is
// responsible for recording that failure). On the last attempt while still
// classified retryable (retries genuinely exhausted): logs a distinct
// "ai_retry" event with outcome "exhausted" before re-throwing, so exhaustion
// is distinguishable in logs from a single non-retryable failure. This never
// fabricates a success, never swallows or replaces the final error, and
// never logs the prompt or any provider error text.
export async function withAiRetry<T>(
  operation: () => Promise<T>,
  context: { operation: AiOperation },
  options: AiRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isLastAttempt = attempt === maxAttempts;
      const category = classifyAiError(err);
      const isRetryable = RETRYABLE_CATEGORIES.has(category);

      if (!isRetryable || isLastAttempt) {
        if (isRetryable && isLastAttempt) {
          logAiEvent("error", "ai_retry", {
            operation: context.operation,
            attempt,
            maxAttempts,
            category,
            outcome: "exhausted",
          });
        }
        throw err;
      }

      logAiEvent("info", "ai_retry", {
        operation: context.operation,
        attempt,
        maxAttempts,
        category,
        outcome: "retrying",
      });

      await sleep(computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitterRatio, random));
    }
  }

  // Unreachable: the loop above always either returns or throws on every
  // iteration, and always executes at least once (maxAttempts >= 1 in
  // practice). Present only so control flow is exhaustively typed without
  // an unsafe assertion.
  throw new Error("withAiRetry: unreachable — the retry loop always returns or throws.");
}
