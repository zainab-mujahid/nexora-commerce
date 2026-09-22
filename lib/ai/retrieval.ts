import "server-only";

import * as z from "zod";

import { getPurchasableProductsByIds } from "@/lib/catalog/products";
import type { ProductDetail } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";

import { generateEmbedding } from "./client";

const MAX_QUERY_LENGTH = 500;
const DEFAULT_MATCH_COUNT = 10;
// Mirrors match_products()'s own least(greatest(...), 50) clamp in
// supabase/schema.sql — kept in sync deliberately, not derived from it (no
// live introspection of the DB function's bound happens here), so this is
// defense-in-depth on top of the RPC's own bound, not a replacement for it.
const MAX_MATCH_COUNT = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Deterministic filters only — no natural-language inference happens here
// (that's a later phase). Rejects malformed input outright (empty/
// oversized query, negative or inverted price range, non-UUID category);
// matchCount is clamped rather than rejected, since it's an internal
// convenience knob, not user-facing text.
const semanticProductSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, { error: "Query must not be empty." })
      .max(MAX_QUERY_LENGTH, {
        error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer.`,
      }),
    matchCount: z.coerce
      .number()
      .int({ error: "matchCount must be a whole number." })
      .optional()
      .transform((value) => clamp(value ?? DEFAULT_MATCH_COUNT, 1, MAX_MATCH_COUNT)),
    minPrice: z.coerce
      .number()
      .min(0, { error: "minPrice must not be negative." })
      .optional(),
    maxPrice: z.coerce
      .number()
      .min(0, { error: "maxPrice must not be negative." })
      .optional(),
    categoryId: z.uuid({ error: "categoryId must be a valid UUID." }).optional(),
  })
  .refine(
    (data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    { error: "minPrice must not exceed maxPrice.", path: ["minPrice"] },
  );

export type SemanticProductSearchInput = z.input<typeof semanticProductSearchInputSchema>;

// ProductDetail (not ProductListItem) as of Step 22 Phase 5: the grounded
// recommendation layer (lib/ai/recommend.ts) needs description/category as
// reasoning context — see the comment on getPurchasableProductsByIds() in
// lib/catalog/products.ts for why that's a widened re-fetch, not a second
// query.
export type SemanticProductSearchResult = ProductDetail & {
  similarity: number;
};

type MatchProductsRow = {
  product_id: string;
  similarity: number;
};

// Hybrid semantic retrieval (Step 22 Phase 3):
//   query -> Gemini query embedding -> match_products() RPC (candidate ids +
//   similarity, already filtered by the DB to active/in-stock/embedded rows
//   plus any deterministic constraints) -> authoritative re-fetch of those
//   ids via getPurchasableProductsByIds() (re-checks is_active/stock > 0
//   again, using current data, not the RPC's own point-in-time read) ->
//   ordered, grounded results.
//
// match_products()'s output is never treated as ground truth on its own —
// only as a ranked list of candidate ids. Every field actually returned to
// the caller (price, stock, images, etc.) comes from the re-fetch, not from
// the RPC row or from embedding text. A candidate that fails the re-fetch
// (deactivated, sold out, or deleted between the RPC call and now) is
// simply omitted, never fabricated or replaced.
//
// Throws on invalid input, an embedding-generation failure, or an RPC/DB
// failure — this function does not itself decide how a caller should
// degrade (e.g. a future UI hiding the assistant vs. showing an error);
// it only guarantees it never silently returns fabricated products.
export async function semanticProductSearch(
  input: SemanticProductSearchInput,
): Promise<SemanticProductSearchResult[]> {
  const parsed = semanticProductSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid semantic search input: ${z.prettifyError(parsed.error)}`);
  }

  const { query, matchCount, minPrice, maxPrice, categoryId } = parsed.data;

  // Reuses the same Gemini embedding abstraction product-embeddings.ts
  // relies on for write-side embeddings — no separate SDK setup here.
  // Throws on failure (see generateEmbedding()'s own contract in
  // lib/ai/client.ts); a query-time embedding failure legitimately should
  // fail this search rather than silently return nothing or something
  // fabricated, so it's intentionally not caught here.
  const queryEmbedding = await generateEmbedding(query);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_products", {
    p_query_embedding: queryEmbedding,
    p_match_count: matchCount,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_category_id: categoryId ?? null,
  });

  if (error) {
    console.error("semanticProductSearch: match_products RPC failed", error);
    throw new Error("Semantic product search is temporarily unavailable.");
  }

  // No generated DB types in this project (see PostgREST typing gotchas),
  // so the RPC's row shape is asserted here rather than inferred.
  const candidates = (data ?? []) as MatchProductsRow[];
  if (candidates.length === 0) return [];

  const similarityByProductId = new Map(
    candidates.map((candidate) => [candidate.product_id, candidate.similarity]),
  );
  const candidateIds = candidates.map((candidate) => candidate.product_id);

  const products = await getPurchasableProductsByIds(candidateIds);
  const productById = new Map(products.map((product) => [product.id, product]));

  // Re-applies match_products()'s own similarity ordering after the
  // re-fetch, since a Postgres `IN (...)` query has no guaranteed
  // correspondence to the order of the id list — and silently drops any
  // candidate the re-fetch didn't return at all (deactivated/out of
  // stock/deleted in the moment between the RPC call and this re-fetch),
  // rather than ever fabricating a stand-in for it.
  return candidateIds
    .map((id) => {
      const product = productById.get(id);
      if (!product) return null;
      return { ...product, similarity: similarityByProductId.get(id)! };
    })
    .filter((result): result is SemanticProductSearchResult => result !== null);
}
