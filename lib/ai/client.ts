import "server-only";

import { GoogleGenAI } from "@google/genai";

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
