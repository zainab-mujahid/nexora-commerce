import { cache } from "react";

import { getS3PublicUrl } from "@/lib/s3/url";
import { createClient } from "@/lib/supabase/server";

import { getCategoryBySlug } from "./categories";
import { getSearchQueryEmbedding } from "./search-embedding";
import { checkCatalogSearchRelevance, type RelevanceCandidate } from "./search-relevance";
import type { Category, ProductDetail, ProductImage, ProductListItem } from "./types";

const LIST_SELECT =
  "id, name, slug, price, stock, images:product_images(id, s3_key, alt_text, is_primary, sort_order)";
const DETAIL_SELECT =
  "id, name, slug, price, stock, description, is_active, category:categories(id, name, slug, description), images:product_images(id, s3_key, alt_text, is_primary, sort_order)";

// product_images rows only ever store the S3 object key — the public URL is
// constructed here, at read time, from deployment configuration
// (S3_PUBLIC_BASE_URL), never persisted. Exported so other owner-scoped
// reads that embed product_images (e.g. lib/cart/queries.ts) reuse this
// instead of re-deriving URLs their own way.
export function attachImageUrls(
  images: Omit<ProductImage, "url">[],
): ProductImage[] {
  return images.map((image) => ({ ...image, url: getS3PublicUrl(image.s3_key) }));
}

// The public product list/detail views apply their own is_active filter on
// top of RLS rather than relying on it alone: RLS's `is_active or is_admin()`
// is a security backstop (it also lets an admin's own session see inactive
// rows), but a customer-facing listing must never show inactive products
// regardless of who happens to be viewing it.
//
// A genuine query failure is thrown, not swallowed: these are called from
// Server Components (Step 6 pages), and throwing lets the nearest error.tsx
// boundary render a real error state, distinct from a legitimate "no
// products" / "not found" result, which is never an error.
export const getActiveProducts = cache(
  async (options?: { limit?: number }): Promise<ProductListItem[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("products")
      .select(LIST_SELECT)
      .eq("is_active", true)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getActiveProducts: failed to load products", error);
      throw new Error("Failed to load products");
    }

    return data.map((product) => ({
      ...product,
      images: attachImageUrls(product.images),
    }));
  },
);

// No is_active filter here: RLS alone decides visibility, so a direct link
// to a deactivated product still resolves for an admin's own session (e.g.
// previewing a draft) while correctly returning null (-> notFound()) for
// everyone else.
export const getProductBySlug = cache(
  async (slug: string): Promise<ProductDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(DETAIL_SELECT)
      .eq("slug", slug)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .maybeSingle();

    if (error) {
      console.error(`getProductBySlug: failed to load product "${slug}"`, error);
      throw new Error("Failed to load product");
    }

    if (!data) return null;

    // TypeScript types `category` as an array — postgrest-js can only prove
    // a to-one embed's cardinality from generated Database types, which this
    // project doesn't have, so it defaults the type to an array. That's a
    // type-inference limitation only: at runtime PostgREST returns a to-one
    // embed (products.category_id -> categories.id) as a plain object or
    // null, never an array, so the value must be used as-is, not indexed.
    const { category, images, ...rest } = data;
    return {
      ...rest,
      images: attachImageUrls(images),
      category: category as unknown as Category | null,
    };
  },
);

// ---- Admin reads (Step 8) ----
// No is_active filter: an admin managing the catalog must see inactive/draft
// products too. RLS's is_admin() check is what makes this safe — a
// non-admin session querying the same way would only ever get active rows
// back, same as the customer-facing functions above.

export const getAdminProducts = cache(async (): Promise<ProductDetail[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(DETAIL_SELECT)
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { referencedTable: "images" })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAdminProducts: failed to load products", error);
    throw new Error("Failed to load products");
  }

  // See the comment in getProductBySlug above: category is a plain object
  // or null at runtime (a to-one embed), not an array — only the inferred
  // TypeScript type says otherwise.
  return data.map(({ category, images, ...rest }) => ({
    ...rest,
    images: attachImageUrls(images),
    category: category as unknown as Category | null,
  }));
});

export const getAdminProductById = cache(
  async (id: string): Promise<ProductDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(DETAIL_SELECT)
      .eq("id", id)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .maybeSingle();

    if (error) {
      console.error(`getAdminProductById: failed to load product "${id}"`, error);
      throw new Error("Failed to load product");
    }

    if (!data) return null;

    // See the comment in getProductBySlug above: category is a plain object
    // or null at runtime (a to-one embed), not an array — only the inferred
    // TypeScript type says otherwise.
    const { category, images, ...rest } = data;
    return {
      ...rest,
      images: attachImageUrls(images),
      category: category as unknown as Category | null,
    };
  },
);

// Escapes ILIKE's own wildcard characters in user-supplied search text, so a
// customer literally searching for "50% off" or "under_score" matches those
// characters instead of them being treated as pattern wildcards.
function escapeIlikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export type ProductSort = "newest" | "price_asc" | "price_desc" | "name_asc";

export type SearchProductsResult = {
  products: ProductListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PRODUCTS_PAGE_SIZE = 12;

// ---- Hybrid catalog search (search_catalog_products(), Phase 2) ----

// How many no-lexical-evidence candidates the RPC returns for the grounded
// relevance check (lib/catalog/search-relevance.ts).
const RELEVANCE_CANDIDATE_COUNT = 8;
// search_catalog_products() rejects longer queries; those use the name
// search below instead.
const MAX_HYBRID_QUERY_LENGTH = 200;

type CatalogSearchRow = { product_id: string; match_tier: number; total_count: number };
type SearchListItem = ProductListItem & { created_at: string };

function emptySearchPage(pageSize: number): SearchProductsResult {
  return { products: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
}

function withoutCreatedAt(product: SearchListItem): ProductListItem {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    stock: product.stock,
    images: product.images,
  };
}

// Loads display rows (same LIST_SELECT + is_active as every storefront list)
// for a bounded set of ids and returns them in the given order. Ids that
// stopped being active in between simply drop out.
async function getListItemsInOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<SearchListItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("products")
    .select(`${LIST_SELECT}, created_at`)
    .in("id", ids)
    .eq("is_active", true)
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { referencedTable: "images" });

  if (error) {
    console.error("searchProducts: failed to load matched products", error);
    throw new Error("Failed to load products");
  }

  const byId = new Map(data.map((product) => [product.id, product]));
  return ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [{ ...product, images: attachImageUrls(product.images) }] : [];
  });
}

// The orderings search_catalog_products() applies, for the few (at most
// RELEVANCE_CANDIDATE_COUNT) relevance-approved products, which are paged
// here instead of in SQL. No sort = relevance = the approved order (most
// similar first). id is the final tie-breaker, as in the RPC.
function sortApproved(products: SearchListItem[], sort: ProductSort | undefined): SearchListItem[] {
  const byId = (a: SearchListItem, b: SearchListItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorted = [...products];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at) || byId(a, b));
    case "price_asc":
      return sorted.sort((a, b) => Number(a.price) - Number(b.price) || byId(a, b));
    case "price_desc":
      return sorted.sort((a, b) => Number(b.price) - Number(a.price) || byId(a, b));
    case "name_asc":
      return sorted.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || byId(a, b));
    default:
      return sorted;
  }
}

// Tier-7 rows are only the nearest products by embedding similarity for a
// query with no lexical evidence — never results by themselves. Only ids the
// grounded relevance check approves (a subset of these candidates) are
// shown; anything else (none approved, check unavailable) is the normal
// "no products match" result.
async function resolveRelevanceCandidates(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  term: string;
  candidateIds: string[];
  sort: ProductSort | undefined;
  requestedPage: number;
  pageSize: number;
}): Promise<SearchProductsResult> {
  const { supabase, term, candidateIds, sort, requestedPage, pageSize } = options;
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, category:categories(name)")
    .in("id", candidateIds)
    .eq("is_active", true);

  if (error) {
    console.error("searchProducts: failed to load search candidates", error);
    return emptySearchPage(pageSize);
  }

  const byId = new Map(data.map((row) => [row.id, row]));
  const candidates: RelevanceCandidate[] = candidateIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    // to-one embed: a plain object or null at runtime (see getProductBySlug).
    const category = row.category as unknown as { name: string } | null;
    return [{ id: row.id, name: row.name, category: category?.name ?? null, description: row.description }];
  });

  const check = await checkCatalogSearchRelevance(term, candidates);
  if (check.status !== "ok" || check.relevantIds.length === 0) {
    return emptySearchPage(pageSize);
  }

  // relevantIds is already a verified subset of the candidates.
  const approved = sortApproved(await getListItemsInOrder(supabase, check.relevantIds), sort);
  if (approved.length === 0) return emptySearchPage(pageSize);
  const totalPages = Math.max(1, Math.ceil(approved.length / pageSize));
  const page = Math.min(requestedPage, totalPages);

  return {
    products: approved.slice((page - 1) * pageSize, page * pageSize).map(withoutCreatedAt),
    totalCount: approved.length,
    page,
    pageSize,
    totalPages,
  };
}

// Tiers 1-3 of search_catalog_products() — exact name, name prefix, whole
// word(s) in the name. When the query already names a product this way, the
// name match is the answer: no query embedding is generated (so no Gemini
// latency/cost and no embedding budget used), and consequently no tier-6
// semantic expansion. Weaker lexical evidence (tier 4 substring, tier 5
// description/category words) still gets the embedding and expansion.
const STRONG_NAME_MATCH_MAX_TIER = 3;

// The q path: search_catalog_products() does candidate selection, ranking,
// counting and paging in PostgreSQL; this loads only one page of display
// rows (or the <= RELEVANCE_CANDIDATE_COUNT candidates). Returns null if the
// RPC itself fails, so searchProducts() can fall back to its name search.
async function searchProductsHybrid(options: {
  term: string;
  categoryId: string | null;
  sort: ProductSort | undefined;
  requestedPage: number;
  pageSize: number;
}): Promise<SearchProductsResult | null> {
  const { term, categoryId, sort, requestedPage, pageSize } = options;
  const supabase = await createClient();

  const rpc = async (params: {
    embedding: number[] | null;
    sort: ProductSort | null;
    limit: number;
    offset: number;
  }): Promise<CatalogSearchRow[] | null> => {
    const { data, error } = await supabase.rpc("search_catalog_products", {
      p_query: term,
      p_query_embedding: params.embedding,
      p_category_id: categoryId,
      p_sort: params.sort,
      p_limit: params.limit,
      p_offset: params.offset,
      p_candidate_count: RELEVANCE_CANDIDATE_COUNT,
    });
    if (error) {
      console.error("searchProducts: search_catalog_products failed, falling back to name search", error);
      return null;
    }
    return (data ?? []) as CatalogSearchRow[];
  };

  // Lexical-only probe (no embedding, so no vector work): in relevance order
  // the first row carries the query's best lexical tier. It decides, before
  // any Gemini call, whether a query embedding is needed at all. The
  // decision depends only on lexical evidence, so it is the same whether or
  // not an embedding happens to be cached — result sets stay stable.
  const probe = await rpc({ embedding: null, sort: null, limit: 1, offset: 0 });
  if (probe === null) return null;
  const hasLexicalEvidence = probe.length > 0;
  const strongNameMatch = hasLexicalEvidence && probe[0].match_tier <= STRONG_NAME_MATCH_MAX_TIER;

  // null (strong name match, too short, budget exhausted or embedding
  // failure) -> the page request runs lexical-only.
  const embedding = strongNameMatch ? null : await getSearchQueryEmbedding(term);
  if (!hasLexicalEvidence && embedding === null) {
    // No lexical evidence and no embedding -> no candidates either.
    return emptySearchPage(pageSize);
  }

  const callRpc = (offset: number) =>
    rpc({ embedding, sort: sort ?? null, limit: pageSize, offset });

  let page = requestedPage;
  let rows = await callRpc((page - 1) * pageSize);
  if (rows === null) return null;

  // A page past the end returns no rows; clamp to the last page the same way
  // the name search does, using the count from the first page.
  if (rows.length === 0 && page > 1) {
    const firstPage = await callRpc(0);
    if (firstPage === null) return null;
    if (firstPage.length === 0 || firstPage[0].match_tier === 7) {
      rows = firstPage;
      page = 1;
    } else {
      page = Math.min(page, Math.max(1, Math.ceil(Number(firstPage[0].total_count) / pageSize)));
      rows = page === 1 ? firstPage : await callRpc((page - 1) * pageSize);
      if (rows === null) return null;
    }
  }

  if (rows.length === 0) return emptySearchPage(pageSize);

  if (rows[0].match_tier === 7) {
    return resolveRelevanceCandidates({
      supabase,
      term,
      candidateIds: rows.filter((row) => row.match_tier === 7).map((row) => row.product_id),
      sort,
      requestedPage,
      pageSize,
    });
  }

  const totalCount = Number(rows[0].total_count);
  const products = await getListItemsInOrder(
    supabase,
    rows.map((row) => row.product_id),
  );
  return {
    products: products.map(withoutCreatedAt),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// Powers /products (Step 19): search, category filter, sort, and pagination,
// all applied server-side against the same is_active-only query the rest of
// the customer storefront uses — a search term or category filter can never
// surface an inactive product.
//
// With a search term, the hybrid catalog search above is used (lexical tiers
// + semantic expansion, and relevance-checked semantic results when nothing
// matches lexically); if its RPC fails, the name search below still runs.
// No sort means relevance order for a search; /products currently always
// passes one (its default is "newest").
export async function searchProducts(options: {
  q?: string;
  categorySlug?: string;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}): Promise<SearchProductsResult> {
  const pageSize = options.pageSize ?? PRODUCTS_PAGE_SIZE;
  const requestedPage = Math.max(1, Math.trunc(options.page ?? 1));

  let categoryId: string | null = null;
  if (options.categorySlug) {
    const category = await getCategoryBySlug(options.categorySlug);
    // An unknown category slug should read as "no matches", not silently
    // fall back to showing every product.
    if (!category) {
      return { products: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
    }
    categoryId = category.id;
  }

  const term = options.q?.trim();

  if (term && term.length <= MAX_HYBRID_QUERY_LENGTH) {
    const hybrid = await searchProductsHybrid({
      term,
      categoryId,
      sort: options.sort,
      requestedPage,
      pageSize,
    });
    if (hybrid) return hybrid;
  }

  const supabase = await createClient();

  // Counted separately, before the row-returning query below: PostgREST
  // responds 416 Range Not Satisfiable for a .range() that starts past the
  // end of the result set, so a stale/out-of-bounds ?page= must be clamped
  // to what actually exists first, rather than ever being sent as a range.
  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (term) countQuery = countQuery.ilike("name", `%${escapeIlikePattern(term)}%`);
  if (categoryId) countQuery = countQuery.eq("category_id", categoryId);

  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("searchProducts: failed to count products", countError);
    throw new Error("Failed to load products");
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  if (totalCount === 0) {
    return { products: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
  }

  let query = supabase.from("products").select(LIST_SELECT).eq("is_active", true);
  if (term) query = query.ilike("name", `%${escapeIlikePattern(term)}%`);
  if (categoryId) query = query.eq("category_id", categoryId);

  switch (options.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "name_asc":
      query = query.order("name", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { referencedTable: "images" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error } = await query;

  if (error) {
    console.error("searchProducts: failed to load products", error);
    throw new Error("Failed to load products");
  }

  return {
    products: data.map((product) => ({
      ...product,
      images: attachImageUrls(product.images),
    })),
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export type ProductsByCategory = {
  category: Category;
  products: ProductListItem[];
};

// Returns null only when the category itself doesn't exist (-> notFound());
// a products-query failure for an existing category throws instead, so a
// real error is never rendered as an empty/"not found" category.
export const getProductsByCategory = cache(
  async (
    categorySlug: string,
    options?: { limit?: number },
  ): Promise<ProductsByCategory | null> => {
    const category = await getCategoryBySlug(categorySlug);
    if (!category) return null;

    const supabase = await createClient();
    let query = supabase
      .from("products")
      .select(LIST_SELECT)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `getProductsByCategory: failed to load products for category "${categorySlug}"`,
        error,
      );
      throw new Error("Failed to load products for this category");
    }

    return {
      category,
      products: data.map((product) => ({
        ...product,
        images: attachImageUrls(product.images),
      })),
    };
  },
);

// ---- AI semantic retrieval re-fetch (Step 22 Phase 3) ----
//
// Stricter than getActiveProducts() above: also requires stock > 0, not
// just is_active. Ordinary storefront browsing intentionally still shows
// out-of-stock active products (with a stock indicator, per Step 19) — but
// a product the AI shopping assistant recommends must never be one a
// customer can't actually buy, so this filters both. Built specifically for
// lib/ai/retrieval.ts's authoritative re-fetch: match_products() only ever
// returns bare candidate ids + similarity scores, never treated as current
// truth, so every id it returns is re-verified against live data here
// before being shown to anyone.
//
// Uses DETAIL_SELECT (not LIST_SELECT) as of Step 22 Phase 5: the grounded
// recommendation layer (lib/ai/recommend.ts) needs description/category as
// reasoning context, same as the product detail page does. `is_active` in
// the result is always true here (this query already filters on it) — that
// is a true, not fabricated, fact about the row. Reusing ProductDetail's
// shape instead of inventing a third product type keeps this to one extra
// query field, not a second query.
//
// Not cache()-wrapped like the functions above: `ids` varies per call, so
// there's nothing stable for React's cache() to key on within a render.
export async function getPurchasableProductsByIds(
  ids: string[],
): Promise<ProductDetail[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(DETAIL_SELECT)
    .in("id", ids)
    .eq("is_active", true)
    .gt("stock", 0)
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { referencedTable: "images" });

  if (error) {
    console.error("getPurchasableProductsByIds: failed to load products", error);
    throw new Error("Failed to load products");
  }

  // See the comment in getProductBySlug above: category is a plain object
  // or null at runtime (a to-one embed), not an array — only the inferred
  // TypeScript type says otherwise.
  return data.map(({ category, images, ...rest }) => ({
    ...rest,
    images: attachImageUrls(images),
    category: category as unknown as Category | null,
  }));
}
