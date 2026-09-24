import "server-only";

import { generateEmbedding } from "@/lib/ai/client";
import { logAiEvent } from "@/lib/ai/log";

// Query embeddings for storefront catalog search (search_catalog_products()'s
// semantic tiers). Uses the same Gemini embedding model/dimensions as the
// stored product embeddings (lib/ai/client.ts), server-side only — the
// browser never sees GEMINI_API_KEY or the vector.
//
// Cached in memory per server instance, keyed by the normalized query, so
// paging/sorting the same search never re-embeds it. The cache is a
// cost/latency optimization only: a miss (restart, other instance, expiry)
// just embeds again.

// Mirrors search_catalog_products()'s own bounds: semantic search needs at
// least 2 characters, and the RPC rejects queries over 200.
const MIN_SEMANTIC_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;

const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

// Per-instance cost guard for query embeddings: distinct uncached queries
// from anonymous visitors would otherwise trigger unbounded Gemini calls.
// Cache hits and requests joining an in-flight embedding don't count. When
// exhausted the query simply gets no embedding, so search_catalog_products()
// runs lexical-only — the storefront's pre-semantic behaviour. Independent
// of the relevance-check budget (lib/catalog/search-relevance.ts) and of the
// shopping assistant's rate limiter.
const BUDGET_MAX_EMBEDDINGS = 120;
const BUDGET_WINDOW_MS = 60 * 1000;
let budgetWindowStart = 0;
let budgetUsed = 0;

function takeBudget(): boolean {
  const now = Date.now();
  if (now - budgetWindowStart >= BUDGET_WINDOW_MS) {
    budgetWindowStart = now;
    budgetUsed = 0;
  }
  if (budgetUsed >= BUDGET_MAX_EMBEDDINGS) return false;
  budgetUsed += 1;
  return true;
}

type CacheEntry = { value: number[]; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<number[] | null>>();

// Case-insensitive, whitespace-collapsed — the same normalization the RPC
// applies to the query text.
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function readCache(key: string): number[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Re-insert to mark as most recently used.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function writeCache(key: string, value: number[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// The query's embedding, or null when semantic search shouldn't/can't run
// for it (too short/long, or the embedding call failed). null is never an
// error for the caller: search_catalog_products() then runs lexical-only.
export async function getSearchQueryEmbedding(query: string): Promise<number[] | null> {
  const key = normalizeSearchQuery(query);
  if (key.length < MIN_SEMANTIC_QUERY_LENGTH || key.length > MAX_QUERY_LENGTH) {
    return null;
  }

  const cached = readCache(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  if (!takeBudget()) {
    logAiEvent("info", "catalog_search_embedding_budget_exhausted", {});
    return null;
  }

  const request = (async () => {
    try {
      const embedding = await generateEmbedding(key, "catalog_search_embedding");
      writeCache(key, embedding);
      return embedding;
    } catch {
      // generateEmbedding() already logged a safe provider event; this one
      // records that search fell back to lexical-only. No query text.
      logAiEvent("error", "catalog_search_embedding_unavailable", {});
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
