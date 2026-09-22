import "server-only";

import { ApiError } from "@google/genai";

// Step 22 Phase 8A — AI error classification foundation. Pure, synchronous,
// no I/O, no retry, no fallback — just turns whatever was thrown by an
// AI/provider operation into one of five deterministic categories so a
// LATER phase (retry/fallback logic, not this one) can decide what to do
// about it. Nothing in this file changes control flow anywhere it is used.
//
// Verified against the actually-installed @google/genai@2.23.0 (checked
// node_modules/@google/genai/dist/node/{node.d.ts,index.cjs} directly,
// not assumed from memory/docs):
//   - `ApiError` (extends Error, has a numeric `status`) is the ONLY
//     provider error class this package actually exports for consumers.
//     Its `status` is set directly from the real HTTP response status
//     (see index.cjs's fetch response handling — `new ApiError({message,
//     status: response.status})` whenever `!response.ok` and the status is
//     in the 400-599 range) — this is genuine structured information, not
//     a guess, and is what every live 429/503 observed during Step 22
//     Phase 5-7 manual testing actually was.
//   - The SDK's own internal HTTPClientError/ConnectionError/
//     RequestTimeoutError/RequestAbortedError/InvalidRequestError/
//     UnexpectedClientError classes are declared in its .d.ts but are NOT
//     exported (no `export` keyword on those declarations) — there is no
//     supported way to `instanceof`-check them from outside the package.
//   - Empirically, a genuine network/connectivity failure in this
//     environment surfaces as a plain `TypeError: fetch failed` (Node's
//     own fetch/undici behavior) — this is exactly what was logged during
//     earlier manual testing (see lib/ai/client.ts's callers) — not one of
//     the unexported SDK classes above. `instanceof TypeError` is
//     therefore the primary, reliable network signal here, not a fallback.
//
// Trust rule: nothing exported from this file — the category string, this
// module's own exports — ever carries a raw provider message, response
// body, prompt, or stack trace. Callers remain responsible for their own
// sanitized, generic, browser-facing text (unchanged from today); this
// module only classifies.
export type AiErrorCategory =
  | "rate_limit"
  | "provider_unavailable"
  | "network"
  | "invalid_response"
  | "internal";

// A caller-thrown marker, not something @google/genai produces. Callers in
// this codebase (lib/ai/intent.ts, lib/ai/recommend.ts) throw this
// specifically where Gemini's response fails our own Zod validation or
// candidate-id allowlist — the exact case the current code has no way to
// distinguish from any other failure today (see the Phase 8A diagnosis in
// the accompanying report). Message text and thrown-error semantics
// (`instanceof Error` still holds) are unchanged from what those call
// sites already threw — this only adds a type a classifier can recognize.
export class AiInvalidResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiInvalidResponseError";
    // Needed for `instanceof` to keep working when this file is compiled
    // to a target that down-levels native class extension of Error — same
    // defensive pattern @google/genai's own ApiError constructor uses.
    Object.setPrototypeOf(this, AiInvalidResponseError.prototype);
  }
}

// Maps a genuine HTTP status from ApiError.status to a category. 429 is
// explicitly rate limiting; the 500/502/503/504 range named in the Phase
// 8A requirements — and 5xx generally, since any server-side status in
// that range is the same kind of "temporary provider-side failure" in
// spirit — is provider_unavailable. Any other status (400/401/403/404/…)
// means the *request itself* was rejected, which points at a bug in how
// this app is calling the provider rather than a transient condition, a
// rate limit, or a malformed response — classified as internal, the
// catch-all for "unexpected application/programming failures."
function categorizeApiError(status: number): AiErrorCategory {
  if (status === 429) return "rate_limit";
  if (status >= 500 && status <= 599) return "provider_unavailable";
  return "internal";
}

// Names of @google/genai's own internal HTTP-client error classes (see the
// module comment above for why they can't be instanceof-checked — they
// exist in the SDK's .d.ts but aren't exported). Checking `.name` against
// this small, explicit, documented list is the smallest safe fallback for
// the two of them that are unambiguously transport-level failures, per the
// Phase 8A instruction to avoid brittle string matching when structured
// info is unavailable — this is a stable discriminator field the SDK sets
// itself, not a match against free-form message text. InvalidRequestError
// and UnexpectedClientError are deliberately excluded: both describe a
// problem with the request this app constructed, not the network, so they
// fall through to `internal` below instead.
const NETWORK_ERROR_NAMES = new Set(["ConnectionError", "RequestTimeoutError", "RequestAbortedError"]);

function classifyOne(err: unknown): AiErrorCategory | null {
  if (err instanceof AiInvalidResponseError) return "invalid_response";
  if (err instanceof ApiError) return categorizeApiError(err.status);
  if (err instanceof TypeError) return "network";
  if (
    err instanceof Error &&
    typeof err.name === "string" &&
    NETWORK_ERROR_NAMES.has(err.name)
  ) {
    return "network";
  }
  return null;
}

// Bounds how far this walks an Error's `.cause` chain looking for a
// classifiable error. lib/ai/intent.ts and lib/ai/recommend.ts wrap the
// original SDK error in a new generic, safe-to-surface Error via the
// standard `cause` option (`new Error(genericMessage, { cause: err })`)
// before re-throwing, specifically so the original — and therefore
// classifiable — error survives internally for exactly this purpose,
// without changing what gets logged or thrown to any existing caller. A
// depth of 3 comfortably covers that one level of wrapping with headroom;
// it is not expected to ever need more.
const MAX_CAUSE_DEPTH = 3;

// The one function this module exists to provide. Never throws, never
// retries, never logs — pure classification of whatever was caught.
// Unknown/malformed thrown values (a string, a plain object, null,
// undefined, or a plain Error with no special type) all safely fall
// through to "internal" rather than crashing or mis-categorizing.
export function classifyAiError(err: unknown): AiErrorCategory {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    const category = classifyOne(current);
    if (category) return category;
    if (!(current instanceof Error) || current.cause === undefined) {
      break;
    }
    current = current.cause;
  }
  return "internal";
}
