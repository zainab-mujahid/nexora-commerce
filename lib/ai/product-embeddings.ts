import "server-only";

import { createClient } from "@/lib/supabase/server";

import { generateEmbedding } from "./client";

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
        console.error(
          `generateAndStoreProductEmbedding: failed to load category for product "${product.id}"`,
          categoryError,
        );
      } else {
        categoryName = category?.name ?? null;
      }
    }

    const text = buildProductEmbeddingText({
      name: product.name,
      description: product.description,
      categoryName,
    });

    const embedding = await generateEmbedding(text);

    const { error: updateError } = await supabase
      .from("products")
      .update({ embedding })
      .eq("id", product.id);

    if (updateError) {
      console.error(
        `generateAndStoreProductEmbedding: failed to persist embedding for product "${product.id}"`,
        updateError,
      );
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    // Message text only, never the raw error/response object — the API key
    // is never part of a request/response body to begin with, but this
    // avoids ever depending on that being true of every current and future
    // SDK error shape.
    console.error(
      `generateAndStoreProductEmbedding: embedding generation failed for product "${product.id}":`,
      err instanceof Error ? err.message : "Unknown error",
    );
    return { success: false };
  }
}
