import "server-only";

import { GoogleGenAI, type Schema } from "@google/genai";

import { GEMINI_API_KEY } from "./env";

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
// lib/ai/product-embeddings.ts's generateAndStoreProductEmbedding().
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  const values = response.embeddings?.[0]?.values;

  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned an embedding of unexpected shape (expected ${EMBEDDING_DIMENSIONS} values).`,
    );
  }

  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("Gemini returned a non-numeric embedding value.");
  }

  return values;
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
}): Promise<unknown> {
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: params.contents,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty structured response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }
}
