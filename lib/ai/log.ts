import "server-only";

// Step 22 Phase 8F — small, structured, console-based observability for the
// AI shopping-assistant pipeline. Deliberately NOT a monitoring platform: no
// database table, no external service, no analytics SDK, no OpenTelemetry,
// no new dependency — plain JSON-lines to stdout/stderr, on the assumption
// that this app's deployment environment already forwards those streams to
// its own logging system. See this file's own trust rule below for what is
// and is not allowed in `fields`.
//
// TRUST RULE: every event this module ever emits is operational METADATA
// only — an event name plus a small set of primitive fields (counts,
// booleans, broad categories, durations, a small closed-set operation
// label). Never a user prompt, never Gemini's generated text, never a raw
// provider error/response body, never a stack trace or `.cause` chain,
// never a Supabase user id/email/IP, never a rate-limiter identity, never a
// product name/description, and never a raw product id unless a specific
// call site has a demonstrated operational need for one (none currently
// does — see lib/ai/recommend.ts's own comment on why an unknown-id count
// is logged instead of the ids themselves). Every call site in lib/ai that
// logs anything about an AI operation is expected to go through this
// module rather than calling console.* directly, so this one file is the
// single place that contract needs to be understood and reviewed.
export type AiOperation =
  | "intent_generation"
  | "query_embedding"
  | "recommendation_generation"
  | "product_embedding_indexing";

export type AiLogFields = Record<string, string | number | boolean | null | undefined>;

// Server-controlled only: every current call site passes a fixed string
// literal or a value computed entirely from server-side data (a count, a
// duration, a classification). Nothing here is ever derived from `input` or
// `previousContext` in lib/ai/actions.ts, and there is no parameter on this
// function a browser-reachable caller could influence.
function emit(level: "info" | "error", event: string, fields: AiLogFields = {}): void {
  const payload = { ts: new Date().toISOString(), event, ...fields };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// The one function every lib/ai/* call site uses. `level` only ever picks
// which stream the same JSON-shaped line goes to (stdout vs stderr) — it
// changes nothing about what is logged.
export function logAiEvent(level: "info" | "error", event: string, fields?: AiLogFields): void {
  emit(level, event, fields);
}
