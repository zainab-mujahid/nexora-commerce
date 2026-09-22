import "server-only";

import { createClient } from "@/lib/supabase/server";

import { generateEmbedding } from "./client";
import { logAiEvent } from "./log";

// Deterministic and shared by create, edit, and backfill alike — if each
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

export type ProductEmbeddingSource = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
};

// Generates and persists one product's embedding. Never throws: every
// failure mode (category lookup, the Gemini call, response-shape
// validation, or the database write itself) is caught here and reported
// back as `{ success: false }` instead, so this can always be safely
// awaited from inside product create/edit without risking that otherwise
// valid write. On any failure, products.embedding is left completely
// untouched — never written to at all. That means NULL stays NULL (a new
// product, or one that has never successfully embedded), and an existing
// embedding from a prior success stays exactly as it was rather than being
// cleared or overwritten with anything malformed: a stale-but-valid
// embedding is strictly better than none, and never worse than whatever
// was already there.
export async function generateAndStoreProductEmbedding(
  product: ProductEmbeddingSource,
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();

    let categoryName: string | null = null;
    if (product.categoryId) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("name")
        .eq("id", product.categoryId)
        .maybeSingle();

      if (categoryError) {
        // Step 22 Phase 8G: this final Phase 8 review found this line
        // logging a raw Supabase error object and a raw product id — the
        // same "no raw DB error body" standard Phase 8F applied everywhere
        // else in lib/ai now applies here too, via the same
        // lib/ai/log.ts abstraction (no new logging system). A product id
        // is a catalog primary key, not customer/secret data, but is
        // omitted anyway for consistency with lib/ai/recommend.ts's own
        // "count, not raw ids" precedent — an aggregate failure signal is
        // enough for this phase's observability needs.
        logAiEvent("error", "ai_product_embedding_failed", {
          operation: "product_embedding_indexing",
          stage: "category_lookup",
        });
      } else {
        categoryName = category?.name ?? null;
      }
    }

    const text = buildProductEmbeddingText({
      name: product.name,
      description: product.description,
      categoryName,
    });

    // Step 22 Phase 8F: generateEmbedding() requires a server-controlled
    // operation label for structured observability (lib/ai/log.ts) — this
    // call site is the admin catalog embedding-indexing path, distinct from
    // the shopping-assistant's own "query_embedding" calls in
    // lib/ai/retrieval.ts. (Phase 8F itself left this file's own logging
    // below untouched as out of scope; Phase 8G's final review brought it
    // into scope and sanitized it — see the comments below.)
    const embedding = await generateEmbedding(text, "product_embedding_indexing");

    const { error: updateError } = await supabase
      .from("products")
      .update({ embedding })
      .eq("id", product.id);

    if (updateError) {
      // Step 22 Phase 8G — see the matching comment above on the
      // category-lookup branch.
      logAiEvent("error", "ai_product_embedding_failed", {
        operation: "product_embedding_indexing",
        stage: "persist",
      });
      return { success: false };
    }

    return { success: true };
  } catch {
    // Step 22 Phase 8G: no err.message here anymore — this final Phase 8
    // review found the old version of this line logging the raw error
    // message (its own comment called out avoiding the raw error/response
    // *object*, but still passed err.message text through), which is
    // exactly the "no raw provider error message" standard the rest of
    // lib/ai now follows. Only the event + stage are logged.
    logAiEvent("error", "ai_product_embedding_failed", {
      operation: "product_embedding_indexing",
      stage: "generation",
    });
    return { success: false };
  }
}
