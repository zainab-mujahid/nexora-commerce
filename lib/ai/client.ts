import "server-only";

import { FinishReason, GoogleGenAI, type Schema, type ThinkingLevel } from "@google/genai";

import { GEMINI_API_KEY } from "./env";
import { AiInvalidResponseError } from "./errors";
import { logAiEvent, type AiOperation } from "./log";
import { withAiRetry } from "./retry";

// Provider-specific SDK usage is isolated to this one module — every caller
// (lib/ai/product-embeddings.ts today, any future AI feature) goes through
// generateEmbedding() below rather than importing @google/genai directly.
// That's what implementation-plan.txt Step 21's "provider portability" note
// means in practice: swapping embedding providers/models later only touches
// this file, not its callers.
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Selected in Step 21, smoke-tested in Step 22 Phase 1A: gemini-embedding-2
// at 1536 output dimensions. A stored products.embedding is only ever
// comparable to a query embedding produced by this exact model/dimension
// pair (see the products.embedding column comment in supabase/schema.sql) —
// changing either requires regenerating every stored embedding, not just
// editing these two constants.
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 1536;

// Throws on any failure: a provider/network error, a missing or malformed
// response, the wrong dimension count, or a non-numeric value. This is
// intentional — generateEmbedding()'s one job is to guarantee that whatever
// it *does* return is a valid, persistable embedding, so every later
// consumer of a resolved value can trust its shape without re-validating.
// Callers that must never fail outright (product create/edit) are
// responsible for catching this themselves — see
// lib/ai/product-embeddings.ts's ensureProductEmbeddingCurrent().
// `operation` (Step 22 Phase 8F): a small, server-controlled label
// identifying which caller this embedding call is for, used only for
// structured observability (see lib/ai/log.ts). Required so nothing here
// is ever silently unobserved — every caller (lib/ai/retrieval.ts,
// lib/ai/product-embeddings.ts) passes a fixed string literal; never a
// value derived from user input.
//
// `options` is optional and only used by the admin bulk search-index repair
// (lib/admin/products.ts): `signal` is handed to the SDK as the request's
// abortSignal (it cancels the real HTTP request; an abort is classified
// "internal", so withAiRetry doesn't retry it), and `onProviderRequest` is
// called once per actual provider request, retries included, so the caller
// can count them. Without options the request is exactly as before.
export type GenerateEmbeddingOptions = {
  signal?: AbortSignal;
  onProviderRequest?: () => void;
};

export async function generateEmbedding(
  text: string,
  operation: AiOperation,
  options: GenerateEmbeddingOptions = {},
): Promise<number[]> {
  const start = performance.now();
  // Step 22 Phase 8G (diagnostic follow-up): a closed-set stage, derived
  // ONLY from which control-flow branch below actually threw — never from
  // any user/provider content, message, or error object. Defaults to
  // "provider_request" (the raw SDK round-trip, including everything
  // withAiRetry itself does with it) and is only ever narrowed to a later
  // stage right before that stage's own throw, so a failure that never
  // reaches the post-call checks keeps the default. Logged only on the
  // error path below — the success log is untouched.
  let failureStage: "provider_request" | "invalid_shape" | "invalid_values" = "provider_request";
  try {
    // Step 22 Phase 8B: retry wraps ONLY this raw provider round-trip, never
    // the shape/finite-number checks below — those are our own validation,
    // not a transient provider condition, and must never be retried (a
    // malformed embedding will be exactly as malformed on a second attempt).
    const response = await withAiRetry(
      () => {
        options.onProviderRequest?.();
        return ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text,
          config: options.signal
            ? { outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal: options.signal }
            : { outputDimensionality: EMBEDDING_DIMENSIONS },
        });
      },
      { operation },
    );

    const values = response.embeddings?.[0]?.values;

    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      failureStage = "invalid_shape";
      throw new Error(
        `Gemini returned an embedding of unexpected shape (expected ${EMBEDDING_DIMENSIONS} values).`,
      );
    }

    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      failureStage = "invalid_values";
      throw new Error("Gemini returned a non-numeric embedding value.");
    }

    // Step 22 Phase 8F: one safe, structured event per call — success or
    // error, never both, never the prompt/error text. durationMs uses
    // performance.now() (monotonic), so it is never skewed by a system
    // clock adjustment mid-call.
    logAiEvent("info", "ai_provider_call", {
      operation,
      outcome: "success",
      durationMs: Math.round(performance.now() - start),
    });
    return values;
  } catch (err) {
    // Step 22 Phase 8G: failureStage added to the existing error event —
    // still no prompt, error message, stack, or cause; just which of the
    // three fixed, known control-flow branches produced this failure.
    logAiEvent("error", "ai_provider_call", {
      operation,
      outcome: "error",
      durationMs: Math.round(performance.now() - start),
      failureStage,
    });
    throw err;
  }
}

// Selected in Step 22 Phase 4 via a runtime check, not guessed: listing
// this API key's available models (ai.models.list()) and probing
// generateContent confirmed "gemini-2.5-flash" is deprecated for this
// project's key — the API's own error response explicitly pointed to
// "gemini-3.6-flash" as its replacement, which was then confirmed working
// with structured JSON output (responseMimeType + responseSchema). A
// "flash"-tier model is the right cost/latency choice for small structured
// extraction like lib/ai/intent.ts — this task needs no "pro"-tier
// reasoning. Re-verify with the same kind of runtime check before reusing
// this constant far in the future; provider model names/availability
// change over time (see EMBEDDING_MODEL's comment above for the same
// caveat).
export const GENERATION_MODEL = "gemini-3.6-flash";

// Requests Gemini's native structured-output mode (a schema-constrained
// generation, not free-form prose parsing) and returns the parsed JSON
// value. Throws on any failure: provider/network error, an empty response,
// or text that isn't valid JSON — same never-silently-wrong contract as
// generateEmbedding() above.
//
// Returns `unknown` deliberately: a requested response schema constrains
// Gemini's *output shape*, but it is not a security or correctness
// boundary on its own, and the model response must still be treated as
// untrusted input. Every caller (lib/ai/intent.ts today) is required to
// validate the parsed value with its own Zod schema before treating any of
// it as trustworthy.
export async function generateStructuredJson(params: {
  systemInstruction: string;
  contents: string;
  responseSchema: Schema;
  // Step 22 Phase 8E: a hard, server-side ceiling on generated output
  // tokens, confirmed via direct inspection of this installed SDK's own
  // type declarations (node_modules/@google/genai/dist/node/node.d.ts,
  // GenerateContentConfig.maxOutputTokens) rather than guessed — the same
  // config object this function already builds `systemInstruction`/
  // `responseMimeType`/`responseSchema` into. Required, not optional, and
  // deliberately has no default here: lib/ai/intent.ts and
  // lib/ai/recommend.ts each define their own bound sized for their own
  // response shape (see each file's own MAX_OUTPUT_TOKENS comment) rather
  // than sharing one value that would either be too tight for one call
  // type or unnecessarily loose for the other. Never client-influenced —
  // both current callers pass a fixed module-level constant, never a
  // value derived from user input.
  maxOutputTokens: number;
  // Step 23B: optional per-call thinking depth. On GENERATION_MODEL, thinking
  // tokens count against maxOutputTokens — at the model's default level,
  // lib/ai/intent.ts's context-update extraction measured ~1,200 thinking
  // tokens for some follow-ups, exhausting its 1024 ceiling before the JSON
  // finished (finishReason MAX_TOKENS). Omitted = the model's own default,
  // so callers that don't pass it (lib/ai/recommend.ts) are unchanged.
  thinkingLevel?: ThinkingLevel;
  // Step 22 Phase 8F: same purpose/contract as generateEmbedding()'s own
  // `operation` parameter above — a fixed, server-controlled label used
  // only for structured observability.
  operation: AiOperation;
}): Promise<unknown> {
  const start = performance.now();
  // Step 22 Phase 8G (diagnostic follow-up): same contract as
  // generateEmbedding()'s own failureStage above — derived purely from
  // which control-flow branch below threw, never from content, logged
  // only on the error path, success log unchanged.
  let failureStage: "provider_request" | "truncated" | "empty_response" | "malformed_json" =
    "provider_request";
  try {
    // Step 22 Phase 8B: retry wraps ONLY this raw provider round-trip. The
    // empty-response and malformed-JSON checks below run strictly after a
    // successful call and are never part of what gets retried — a caller
    // that keeps throwing away malformed output would just do so again on
    // any additional attempt, which is exactly the kind of validation
    // failure this project's retry policy explicitly excludes.
    const response = await withAiRetry(
      () =>
        ai.models.generateContent({
          model: GENERATION_MODEL,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: "application/json",
            responseSchema: params.responseSchema,
            maxOutputTokens: params.maxOutputTokens,
            ...(params.thinkingLevel && { thinkingConfig: { thinkingLevel: params.thinkingLevel } }),
          },
        }),
      { operation: params.operation },
    );

    // Checked before anything reads the text: output cut off at
    // maxOutputTokens is at best a JSON prefix, so it's reported as its own
    // stage rather than surfacing later as "malformed_json". Like the parse
    // failure below, it's the model's output failing our contract, so both
    // throw AiInvalidResponseError (-> "invalid_response" via
    // classifyAiError's cause walk), never a retryable category — and
    // neither message carries any response content.
    if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      failureStage = "truncated";
      throw new AiInvalidResponseError("Gemini's structured response was truncated.");
    }

    const text = response.text;
    if (!text) {
      failureStage = "empty_response";
      throw new Error("Gemini returned an empty structured response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      failureStage = "malformed_json";
      throw new AiInvalidResponseError("Gemini returned malformed JSON.");
    }

    // Step 22 Phase 8F: one safe, structured event per call — success or
    // error, never both, never the response text/prompt.
    logAiEvent("info", "ai_provider_call", {
      operation: params.operation,
      outcome: "success",
      durationMs: Math.round(performance.now() - start),
    });
    return parsed;
  } catch (err) {
    // Step 22 Phase 8G: failureStage added to the existing error event —
    // still no prompt, error message, stack, or cause; just which of the
    // three fixed, known control-flow branches produced this failure.
    logAiEvent("error", "ai_provider_call", {
      operation: params.operation,
      outcome: "error",
      durationMs: Math.round(performance.now() - start),
      failureStage,
    });
    throw err;
  }
}
