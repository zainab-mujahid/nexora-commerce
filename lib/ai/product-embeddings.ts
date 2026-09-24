import "server-only";

import { createHash } from "node:crypto";

import { createClient } from "@/lib/supabase/server";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  generateEmbedding,
  type GenerateEmbeddingOptions,
} from "./client";
import { logAiEvent } from "./log";

// Deterministic and shared by create, edit, and repair alike — if each
// call site built its own text differently, a product's embedding could
// drift out of comparability with another's purely from formatting, not
// any real semantic difference. Only semantic/searchable fields go in:
// name, description, category name. Price, stock, is_active, IDs, and
// timestamps are fast-changing, non-semantic business facts and must never
// be embedded (implementation-plan.txt Step 21) — they remain authoritative
// database filters applied alongside similarity search (see
// match_products() in supabase/schema.sql), never embedding content.
export function buildProductEmbeddingText(input: {
  name: string;
  description: string | null;
  categoryName: string | null;
}): string {
  return [
    `Product: ${input.name}`,
    input.categoryName ? `Category: ${input.categoryName}` : null,
    input.description ? `Description: ${input.description}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

// Fingerprint of exactly what an embedding is generated from: the model,
// its output dimensions, and the embedding text. Stored in
// products.embedding_source_hash together with the embedding, so comparing
// it with the fingerprint of a product's CURRENT text shows whether its
// embedding is current — a name/description/category-name change, or a
// model/dimension change, alters the hash; slug/price/stock/is_active/
// images are not in the text and never do. JSON array serialization keeps
// the three parts unambiguous (no delimiter can collide with the text).
export function productEmbeddingSourceHash(
  text: string,
  model: string = EMBEDDING_MODEL,
  dimensions: number = EMBEDDING_DIMENSIONS,
): string {
  return createHash("sha256")
    .update(JSON.stringify([model, dimensions, text]))
    .digest("hex");
}

// What ensureProductEmbeddingCurrent() found or did:
// - current: the stored embedding already matches the product's current
//   text (hash equal, vector present) — no Gemini call was made.
// - updated: a new embedding and its hash were stored; failure cleared.
// - failed: this attempt failed; the existing embedding/hash were left
//   exactly as they were and the failure time was recorded (best effort).
// - superseded: the product (or its category's name) changed while the
//   embedding was being generated, so the result was discarded rather than
//   stored over newer data. Not a failure: the change's own save runs this
//   again, and the stored hash no longer matches, so it reads as needing
//   repair until then.
// - not_found: the product no longer exists (or isn't visible).
export type ProductEmbeddingResult = {
  status: "current" | "updated" | "failed" | "superseded" | "not_found";
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type EmbeddingSourceRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  embedding_source_hash: string | null;
};

const SOURCE_COLUMNS = "id, name, description, category_id, embedding_source_hash";

function logFailure(stage: string) {
  // Stage + operation only — never product text, ids, or provider/DB error
  // details (Step 22 Phase 8F/8G logging standard).
  logAiEvent("error", "ai_product_embedding_failed", {
    operation: "product_embedding_indexing",
    stage,
  });
}

// A NULL category_id is a legitimate "no category". A non-NULL one must
// resolve to a real row: a failed or empty lookup is NOT treated as "no
// category", because embedding the text without it would store a degraded
// embedding presented as a good one.
async function loadCategoryName(
  supabase: SupabaseClient,
  categoryId: string | null,
): Promise<{ ok: true; name: string | null } | { ok: false }> {
  if (categoryId === null) return { ok: true, name: null };

  const { data, error } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  if (error || !data) return { ok: false };
  return { ok: true, name: data.name };
}

async function loadSource(supabase: SupabaseClient, productId: string) {
  return supabase
    .from("products")
    .select(SOURCE_COLUMNS)
    .eq("id", productId)
    .maybeSingle<EmbeddingSourceRow>();
}

// Records a failed attempt without touching the embedding or its hash.
// Guarded on the hash read at the start of the attempt, so it never marks a
// product whose embedding someone else has just made current. Best effort:
// an error here is logged, never thrown.
async function recordFailure(supabase: SupabaseClient, product: EmbeddingSourceRow) {
  const query = supabase
    .from("products")
    .update({ embedding_failed_at: new Date().toISOString() })
    .eq("id", product.id);
  const { error } = await (product.embedding_source_hash === null
    ? query.is("embedding_source_hash", null)
    : query.eq("embedding_source_hash", product.embedding_source_hash));
  if (error) logFailure("record_failure");
}

// Makes a product's embedding correspond to its CURRENT name, description
// and category name — idempotent, so it is safe (and cheap) to call after
// every successful product save: when the stored hash already matches, it
// returns without calling Gemini. Never throws; product create/edit treat
// the embedding as best-effort and never fail because of it.
//
// Race safety: after the (slow) Gemini call, the product and its category
// name are re-read and must still produce the exact text that was
// embedded, and the final write only applies while name, category_id and
// the stored hash are still what this attempt started from. A change in
// between is reported as `superseded` and nothing is written. If a change
// slips into the single round trip between that re-read and the write, the
// hash stored is still the hash of the text actually embedded — so the
// product reads as out of date and gets repaired, never falsely current.
//
// `options` (optional) is passed through to generateEmbedding() unchanged —
// used only by the admin bulk repair to bound and count Gemini requests. An
// aborted request is an ordinary generation failure here (recorded, old
// embedding and hash kept); nothing else in this function changes.
export async function ensureProductEmbeddingCurrent(
  productId: string,
  options: GenerateEmbeddingOptions = {},
): Promise<ProductEmbeddingResult> {
  try {
    const supabase = await createClient();

    const { data: product, error: productError } = await loadSource(supabase, productId);
    if (productError) {
      logFailure("product_lookup");
      return { status: "failed" };
    }
    if (!product) return { status: "not_found" };

    const category = await loadCategoryName(supabase, product.category_id);
    if (!category.ok) {
      logFailure("category_lookup");
      await recordFailure(supabase, product);
      return { status: "failed" };
    }

    const text = buildProductEmbeddingText({
      name: product.name,
      description: product.description,
      categoryName: category.name,
    });
    const hash = productEmbeddingSourceHash(text);

    // The hash is only ever written together with the embedding, but a
    // matching hash counts as current only once the vector is confirmed
    // present (checked without transferring it).
    if (product.embedding_source_hash === hash) {
      const { count, error: presentError } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("id", product.id)
        .is("embedding", null);
      if (presentError) {
        logFailure("product_lookup");
        return { status: "failed" };
      }
      if (count === 0) return { status: "current" };
    }

    let embedding: number[];
    try {
      embedding = await generateEmbedding(text, "product_embedding_indexing", options);
    } catch {
      logFailure("generation");
      await recordFailure(supabase, product);
      return { status: "failed" };
    }

    // Re-read after the Gemini call: the product or its category name may
    // have changed meanwhile.
    const { data: latest, error: latestError } = await loadSource(supabase, product.id);
    if (latestError) {
      logFailure("product_lookup");
      await recordFailure(supabase, product);
      return { status: "failed" };
    }
    if (!latest) return { status: "not_found" };
    const latestCategory = await loadCategoryName(supabase, latest.category_id);
    if (!latestCategory.ok) {
      logFailure("category_lookup");
      await recordFailure(supabase, product);
      return { status: "failed" };
    }
    const latestText = buildProductEmbeddingText({
      name: latest.name,
      description: latest.description,
      categoryName: latestCategory.name,
    });
    if (latestText !== text || latest.embedding_source_hash !== product.embedding_source_hash) {
      return { status: "superseded" };
    }

    // Guarded write: embedding, hash and the failure reset together, only
    // while the product still has the name/category/hash this attempt was
    // based on (description was re-checked just above; it can be up to
    // 2000 characters, too long to repeat as a URL filter).
    let write = supabase
      .from("products")
      .update({ embedding, embedding_source_hash: hash, embedding_failed_at: null })
      .eq("id", product.id)
      .eq("name", product.name);
    write = product.category_id === null
      ? write.is("category_id", null)
      : write.eq("category_id", product.category_id);
    write = product.embedding_source_hash === null
      ? write.is("embedding_source_hash", null)
      : write.eq("embedding_source_hash", product.embedding_source_hash);
    const { data: written, error: writeError } = await write.select("id");

    if (writeError) {
      logFailure("persist");
      await recordFailure(supabase, product);
      return { status: "failed" };
    }
    if (written.length === 0) return { status: "superseded" };

    return { status: "updated" };
  } catch {
    logFailure("unexpected");
    return { status: "failed" };
  }
}
