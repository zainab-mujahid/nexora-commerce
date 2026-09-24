import "server-only";

import { createClient } from "@/lib/supabase/server";

import { buildProductEmbeddingText, productEmbeddingSourceHash } from "./product-embeddings";

// Search-index status of a product's embedding. Derived on read, never
// stored: it depends on the product's CURRENT name/description/category
// name, which can change (including through a category rename) without the
// product row being written.
export type ProductEmbeddingStatus =
  | "up_to_date" // embedding present and generated from the current text
  | "missing" // no embedding
  | "out_of_date" // embedding present, but not provably from the current text
  | "repair_failed"; // missing/out of date, and the latest attempt to fix it failed

// Everything the status depends on, already loaded. `hasEmbedding` is a
// boolean on purpose: presence is all that matters here, and the vector is
// never transferred to find it out (see getProductEmbeddingStatuses).
export type ProductEmbeddingStatusInput = {
  name: string;
  description: string | null;
  categoryName: string | null;
  hasEmbedding: boolean;
  embeddingSourceHash: string | null;
  embeddingFailedAt: string | null;
};

// Pure: no database, no Gemini. Uses the same text builder and hash as
// ensureProductEmbeddingCurrent(), so "up to date" here means exactly
// "ensure would make no Gemini call". A recorded failure only marks a
// product that still needs attention — a current embedding stays
// up_to_date even if an older failure timestamp remains.
export function deriveProductEmbeddingStatus(
  input: ProductEmbeddingStatusInput,
): ProductEmbeddingStatus {
  const expected = productEmbeddingSourceHash(
    buildProductEmbeddingText({
      name: input.name,
      description: input.description,
      categoryName: input.categoryName,
    }),
  );

  if (input.hasEmbedding && input.embeddingSourceHash === expected) return "up_to_date";
  if (input.embeddingFailedAt !== null) return "repair_failed";
  return input.hasEmbedding ? "out_of_date" : "missing";
}

// Per product: `status` when it could be derived. `unresolved` when the
// product has a category_id whose category name could not be read — the
// status is then unknown rather than guessed (treating it as "no category"
// could wrongly report a stale embedding as current, or the reverse).
// `isActive`, `createdAt` and `failedAt` (embedding_failed_at) ride along
// (they are already on the row) so maintenance can order its work; the
// status itself is derived only by deriveProductEmbeddingStatus().
export type ProductEmbeddingStatusResult =
  | { status: ProductEmbeddingStatus; isActive: boolean; createdAt: string; failedAt: string | null }
  | { status: null; unresolved: "category"; isActive: boolean; createdAt: string; failedAt: string | null };

type StatusRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  embedding_source_hash: string | null;
  embedding_failed_at: string | null;
  category: { name: string } | null;
};

const STATUS_SELECT =
  "id, name, description, category_id, is_active, created_at, embedding_source_hash, embedding_failed_at, category:categories(name)";

// PostgREST caps a response at the project's max-rows (1000 by default), so
// an unfiltered read is paged; an id-filtered read is chunked to keep the
// `in.(...)` filter well within URL limits.
const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type LoadResult<T> = { ok: true; rows: T[] } | { ok: false };

async function loadStatusRows(supabase: Supabase, ids: string[] | null): Promise<LoadResult<StatusRow>> {
  return loadRows(ids, (from, to, chunk) => {
    let query = supabase.from("products").select(STATUS_SELECT).order("id");
    if (chunk) query = query.in("id", chunk);
    return query.range(from, to);
  });
}

// Ids of products with no embedding: a filter on the vector column that
// returns ids only, so no vector is ever transferred.
async function loadMissingIds(supabase: Supabase, ids: string[] | null): Promise<LoadResult<{ id: string }>> {
  return loadRows(ids, (from, to, chunk) => {
    let query = supabase.from("products").select("id").is("embedding", null).order("id");
    if (chunk) query = query.in("id", chunk);
    return query.range(from, to);
  });
}

async function loadRows<T>(
  ids: string[] | null,
  fetchRange: (
    from: number,
    to: number,
    chunk: string[] | null,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<LoadResult<T>> {
  const chunks: (string[] | null)[] = [];
  if (ids === null) {
    chunks.push(null);
  } else {
    for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) chunks.push(ids.slice(i, i + ID_CHUNK_SIZE));
  }

  const rows: T[] = [];
  for (const chunk of chunks) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await fetchRange(from, from + PAGE_SIZE - 1, chunk);
      if (error || !data) return { ok: false };
      rows.push(...(data as T[]));
      if (data.length < PAGE_SIZE) break;
    }
  }
  return { ok: true, rows };
}

// Statuses for many products at once — for the admin product list and
// maintenance counts. Two queries per page of results however many products
// there are (product fields + current category name together, then the ids
// that have no embedding), and the rest is derived in memory with
// deriveProductEmbeddingStatus(). Read-only: no Gemini call, no write.
//
// `productIds` limits it to those products (e.g. one page of the list);
// omitted, it covers every product the caller can see (an admin session
// sees inactive products too, through RLS). Products that don't exist or
// aren't visible are simply absent from the map. `{ ok: false }` when
// either read fails — no statuses are guessed from partial data.
//
// The two reads are separate statements, so a product saved between them
// can show its state from just before or just after that save; the next
// read reflects it.
export async function getProductEmbeddingStatuses(
  productIds?: string[],
): Promise<{ ok: true; statuses: Map<string, ProductEmbeddingStatusResult> } | { ok: false }> {
  const ids = productIds ? [...new Set(productIds)] : null;
  const statuses = new Map<string, ProductEmbeddingStatusResult>();
  if (ids !== null && ids.length === 0) return { ok: true, statuses };

  const supabase = await createClient();
  const [products, missing] = await Promise.all([
    loadStatusRows(supabase, ids),
    loadMissingIds(supabase, ids),
  ]);
  if (!products.ok || !missing.ok) {
    console.error("getProductEmbeddingStatuses: failed to load products");
    return { ok: false };
  }

  const missingIds = new Set(missing.rows.map((row) => row.id));
  for (const row of products.rows) {
    // A to-one embed is a plain object or null at runtime (see
    // getAdminProducts in lib/catalog/products.ts).
    const category = row.category as unknown as { name: string } | null;
    if (row.category_id !== null && category === null) {
      statuses.set(row.id, { status: null, unresolved: "category", isActive: row.is_active, createdAt: row.created_at, failedAt: row.embedding_failed_at });
      continue;
    }
    statuses.set(row.id, {
      status: deriveProductEmbeddingStatus({
        name: row.name,
        description: row.description,
        categoryName: category?.name ?? null,
        hasEmbedding: !missingIds.has(row.id),
        embeddingSourceHash: row.embedding_source_hash,
        embeddingFailedAt: row.embedding_failed_at,
      }),
      isActive: row.is_active,
      createdAt: row.created_at,
      failedAt: row.embedding_failed_at,
    });
  }
  return { ok: true, statuses };
}

// Search-index health of the catalog, counted from the canonical statuses
// above (never from embedding NULL/non-NULL alone). `unresolved` products
// are counted separately, never as up to date. `needsAttention` = missing +
// out of date + repair failed: the products a repair run would work on.
export type ProductSearchIndexHealth = {
  total: number;
  upToDate: number;
  missing: number;
  outOfDate: number;
  repairFailed: number;
  unresolved: number;
  needsAttention: number;
};

// Pure: counts an already-loaded status map.
export function summarizeProductEmbeddingStatuses(
  statuses: Map<string, ProductEmbeddingStatusResult>,
): ProductSearchIndexHealth {
  const health: ProductSearchIndexHealth = {
    total: 0,
    upToDate: 0,
    missing: 0,
    outOfDate: 0,
    repairFailed: 0,
    unresolved: 0,
    needsAttention: 0,
  };
  for (const entry of statuses.values()) {
    health.total++;
    switch (entry.status) {
      case "up_to_date":
        health.upToDate++;
        break;
      case "missing":
        health.missing++;
        break;
      case "out_of_date":
        health.outOfDate++;
        break;
      case "repair_failed":
        health.repairFailed++;
        break;
      case null:
        health.unresolved++;
        break;
    }
  }
  health.needsAttention = health.missing + health.outOfDate + health.repairFailed;
  return health;
}

// Health of every product the caller can see — read-only (no Gemini call,
// no write). Call it from admin-only server code: an admin session sees
// inactive products too; any other session would get active ones only.
export async function getProductSearchIndexHealth(): Promise<
  { ok: true; health: ProductSearchIndexHealth } | { ok: false }
> {
  const result = await getProductEmbeddingStatuses();
  if (!result.ok) return { ok: false };
  return { ok: true, health: summarizeProductEmbeddingStatuses(result.statuses) };
}
