import "server-only";

import { getCategories } from "@/lib/catalog/categories";
import { getPurchasableProductsByIds } from "@/lib/catalog/products";

import {
  mergeShoppingContext,
  shoppingContextTurnInputSchema,
  type ShoppingContext,
  type ShoppingContextFieldUpdate,
  type ShoppingContextTurnInput,
} from "./context";
import { extractShoppingContextUpdate, extractShoppingIntent, type ShoppingIntent } from "./intent";
import { semanticProductSearch, type SemanticProductSearchResult } from "./retrieval";

// Deterministic, exact-match only — never fuzzy/LLM-assisted. Gemini
// extracts category as free text (e.g. "shoes") and has no access to the
// categories table; it must never be allowed to invent or guess a
// categories.id. This is the one place that raw text is allowed to become
// a real database id, and only by matching it against categories that
// actually exist right now. No match -> null, never a fabricated id.
//
// Exported as of Step 22 Phase 7E: searchProductsWithShoppingContext()'s
// category bridge further down reuses this exact function rather than
// re-implementing category resolution — resolveCategoryId()'s real-
// category authority is never weakened or duplicated.
export async function resolveCategoryId(categoryText: string | null): Promise<string | null> {
  if (!categoryText) return null;

  let categories: Awaited<ReturnType<typeof getCategories>>;
  try {
    categories = await getCategories();
  } catch (err) {
    // A category-lookup failure must not sink the whole search — semantic
    // retrieval alone (see the semanticQuery comment below) can still
    // produce useful results without a deterministic category filter.
    console.error(
      "resolveCategoryId: failed to load categories:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return null;
  }

  const normalized = categoryText.trim().toLowerCase();
  const slugified = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const match = categories.find(
    (category) => category.name.toLowerCase() === normalized || category.slug === normalized || category.slug === slugified,
  );

  return match?.id ?? null;
}

export type NaturalLanguageProductSearchResult = {
  intent: ShoppingIntent;
  categoryId: string | null;
  products: SemanticProductSearchResult[];
};

// Controlled orchestration (Step 22 Phase 4): natural-language input ->
// extractShoppingIntent() -> deterministic category resolution ->
// semanticProductSearch() (Phase 3, unchanged, not duplicated). No
// retrieval logic lives here — this function only extracts intent,
// resolves a category id against real data, and hands validated,
// deterministic parameters to the existing retrieval layer.
//
// An unmatched category is never treated as a hard failure: semanticQuery
// is deliberately NOT stripped of category/descriptive words by Gemini
// (see the SYSTEM_INSTRUCTION in lib/ai/intent.ts) specifically so that
// when resolveCategoryId() can't find a matching real category,
// semanticQuery still carries that meaning into semantic retrieval on its
// own — e.g. a customer saying "sneakers" when the catalog only has a
// "Shoes" category still gets sneaker-relevant results, just without the
// deterministic category filter applied.
//
// Throws on any failure along the way (invalid/empty input, a Gemini
// failure, or a retrieval failure) — same controlled-failure contract as
// extractShoppingIntent() and semanticProductSearch() individually. Never
// falls back to a fabricated intent or fabricated products.
export async function searchProductsFromNaturalLanguage(
  userInput: string,
): Promise<NaturalLanguageProductSearchResult> {
  const intent = await extractShoppingIntent(userInput);
  const categoryId = await resolveCategoryId(intent.category);

  const products = await semanticProductSearch({
    query: intent.semanticQuery,
    minPrice: intent.minPrice ?? undefined,
    maxPrice: intent.maxPrice ?? undefined,
    categoryId: categoryId ?? undefined,
    matchCount: intent.requestedCount ?? undefined,
  });

  return { intent, categoryId, products };
}

// ---- Step 22 Phase 7E — context-aware retrieval ----
//
// searchProductsFromNaturalLanguage() above is entirely UNCHANGED — this
// section adds a new, separate orchestration path rather than modifying
// it, matching the same "don't put the working pipeline at risk"
// reasoning Phase 7D used for extractShoppingIntent() vs.
// extractShoppingContextUpdate(). lib/ai/assistant.ts (the sole
// production caller) now exclusively uses
// searchProductsWithShoppingContext() below, for every turn — so
// searchProductsFromNaturalLanguage() is unused by production code today,
// though it remains exported and working rather than deleted (see the
// note in lib/ai/intent.ts on extractShoppingIntent() for why). Both
// paths share the exact same resolveCategoryId() and
// semanticProductSearch() — nothing about Phase 3 (embedding,
// match_products RPC, authoritative re-fetch, is_active/stock>0) is
// duplicated or weakened by either path.

// Bridges Gemini's free-text categoryText (lib/ai/intent.ts's
// ShoppingIntentUpdate) to a trusted ShoppingContextTurnInput.categoryId
// update, through resolveCategoryId() — the same real-category authority
// used everywhere else. Gemini never produces a UUID; this is the only
// place text becomes one, and only by matching a category that actually
// exists right now.
//
// IMPORTANT unresolved-category rule: "unchanged" and "clear" pass
// through untouched (nothing to resolve). For "set", if resolveCategoryId()
// finds no match, the result is "clear", NOT "unchanged". Falling back to
// "unchanged" would let a stale previous category silently survive and
// keep being searched — e.g. previous context "Shoes", customer explicitly
// says "show me furniture" (no such category), "unchanged" would wrongly
// keep searching Shoes. "clear" deterministically drops any category
// filter for this turn instead: mergeShoppingContext() then resolves the
// merged categoryId to null (never inherits the stale one, never
// fabricates an id), and the customer's own words ("furniture") still
// flow into semanticQuery for semantic-only retrieval — the same "no
// match -> no filter, not an error" contract resolveCategoryId() already
// has today. If that semantic-only search also finds nothing relevant,
// the existing no_results handling in lib/ai/assistant.ts naturally takes
// over — no new response type/status was needed for this.
async function resolveCategoryTextUpdate(
  categoryText: ShoppingContextFieldUpdate<string>,
): Promise<ShoppingContextFieldUpdate<string>> {
  if (categoryText.kind !== "set") {
    return categoryText;
  }

  const resolvedId = await resolveCategoryId(categoryText.value);
  if (resolvedId) {
    return { kind: "set", value: resolvedId };
  }
  return { kind: "clear" };
}

// Converts a validated ShoppingIntentUpdate (lib/ai/intent.ts, Gemini-
// facing, categoryText only) into a validated ShoppingContextTurnInput
// (lib/ai/context.ts, categoryId only) — the one bridge point where
// category text becomes a trusted id. Every other field maps straight
// across unchanged; only categoryText goes through
// resolveCategoryTextUpdate() above. Re-validates the result through
// shoppingContextTurnInputSchema before handing it to
// mergeShoppingContext(), same defense-in-depth every other Phase 7
// boundary already applies.
async function buildShoppingContextTurnInput(
  update: Awaited<ReturnType<typeof extractShoppingContextUpdate>>,
): Promise<ShoppingContextTurnInput> {
  const categoryId = await resolveCategoryTextUpdate(update.categoryText);

  return shoppingContextTurnInputSchema.parse({
    contextAction: update.contextAction,
    semanticQuery: update.semanticQuery,
    categoryId,
    minPrice: update.minPrice,
    maxPrice: update.maxPrice,
    pricePreference: update.pricePreference,
  });
}

// Mirrors lib/ai/retrieval.ts's own DEFAULT_MATCH_COUNT/MAX_MATCH_COUNT —
// kept in sync deliberately, not derived from either (both are private to
// that module), same "mirror, don't duplicate the source of truth"
// pattern already used throughout this codebase (e.g. this file's own
// MAX_SEMANTIC_QUERY_LENGTH-style mirrors in lib/ai/intent.ts). Reusing
// retrieval's own already-established bounds here, rather than inventing
// new numbers, is what keeps the "larger but still bounded candidate set"
// strategy below a *bounded*, not unbounded, retrieval.
const DEFAULT_RETRIEVAL_MATCH_COUNT = 10;
const MAX_RETRIEVAL_MATCH_COUNT = 50;

// Exported as of the Phase 7E "cheaper ones" grounding fix: this is the
// exact server-derived fact lib/ai/recommend.ts needs to explain a
// relative price preference correctly — see the module comment on
// generateGroundedRecommendation()'s `priceReference` parameter for why.
export type PriceReference = {
  pricePreference: "cheaper" | "more_expensive";
  referencePrice: number;
};

// Step 22 Phase 7E (corrected) relative price preference: "cheaper"/
// "more_expensive" never invent a numeric margin. The previous turn's
// verified recommendedProductIds (carried in ShoppingContext — see
// mergeShoppingContext()'s own handling of that field) are re-fetched
// here through the exact same authoritative, currently-purchasable path
// every other retrieval candidate goes through
// (getPurchasableProductsByIds() — is_active/stock>0, current price).
// Those ids come from ShoppingContext, which round-trips through the
// browser via lib/ai/actions.ts (Step 22 Phase 7F), so they are never
// trusted directly; only products this re-fetch actually confirms are
// used as the reference set.
//
// Deterministic reference-price rule (unchanged from the original design,
// only how it's *applied* changed — see matchesPriceReference() and
// searchProductsWithShoppingContext() below):
//   "cheaper"        -> the MINIMUM price among the re-verified previous
//                        recommendations ("cheaper than the cheapest one
//                        already shown").
//   "more_expensive" -> the MAXIMUM price among them (symmetric).
// If no valid reference products remain (ids stale/deleted/deactivated/
// sold out, or there simply were none), this degrades safely to no
// reference at all — never an invented threshold.
//
// This reference price is used ONLY as an ephemeral, this-turn-only
// filtering input (see searchProductsWithShoppingContext() below) — it is
// never written back into the persisted ShoppingContext, which keeps
// exactly the constraints the customer actually stated. That is also what
// lets a repeated "even cheaper" naturally keep tightening across turns:
// each turn's own newly verified recommendedProductIds become the next
// turn's reference set automatically, with no synthetic price stored
// anywhere.
async function resolvePriceReference(
  pricePreference: "cheaper" | "more_expensive" | null,
  recommendedProductIds: string[],
): Promise<PriceReference | null> {
  if (!pricePreference || recommendedProductIds.length === 0) {
    return null;
  }

  const referenceProducts = await getPurchasableProductsByIds(recommendedProductIds);
  if (referenceProducts.length === 0) {
    return null;
  }

  const prices = referenceProducts.map((product) => Number(product.price));
  const referencePrice = pricePreference === "cheaper" ? Math.min(...prices) : Math.max(...prices);

  return { pricePreference, referencePrice };
}

// STRICT comparison, deliberately not folded into semanticProductSearch()'s
// own inclusive minPrice/maxPrice (price <= maxPrice / price >= minPrice):
// doing so would let the reference product's own price remain eligible
// (e.g. previous recommendations $90/$65, "cheaper ones" using an
// inclusive maxPrice=65 would still allow another $65 product through,
// which is not what "cheaper" means). No +/- margin, no percentage, no
// epsilon — just a strict less-than/greater-than comparison against the
// real reference price from resolvePriceReference() above.
function matchesPriceReference(price: number, reference: PriceReference): boolean {
  return reference.pricePreference === "cheaper" ? price < reference.referencePrice : price > reference.referencePrice;
}

export type ShoppingContextSearchResult = {
  context: ShoppingContext;
  products: SemanticProductSearchResult[];
  // The exact same authoritative reference used for strict filtering above
  // (null when no price preference was active this turn) — handed to the
  // caller so it can pass it into generateGroundedRecommendation()'s
  // grounding prompt as a small, trusted, server-derived fact. Without it,
  // Gemini has no way to know what a relative word like "cheaper" in the
  // raw customer request actually refers to, even though the candidates
  // themselves were already correctly filtered.
  priceReference: PriceReference | null;
};

// Controlled orchestration (Step 22 Phase 7E): current message + optional
// previous ShoppingContext -> extractShoppingContextUpdate() (Phase 7D) ->
// category bridge -> deterministic mergeShoppingContext() (Phase 7C) ->
// semanticProductSearch() (Phase 3, unchanged, not duplicated) -> strict
// relative-price post-filter, when applicable.
//
// Semantic query safety: a merged context can legitimately end up with no
// semanticQuery at all (e.g. a fully "clear"ed context, or a "new"/"clear"
// turn whose own message implied nothing searchable). semanticProductSearch()
// requires a non-empty query and would throw on one — rather than let that
// surface as a raw validation error, this returns zero products directly,
// which lib/ai/assistant.ts's existing no_results handling already covers
// gracefully. No meaningless/empty text is ever sent to embedding or
// retrieval.
//
// Relative price preference (corrected): the customer's own stated
// absolute minPrice/maxPrice are passed to semanticProductSearch()
// completely unchanged — those remain authoritative, inclusive,
// deterministic constraints exactly as Phase 3 already enforces them, at
// the database level via match_products(). A pricePreference is a
// SEPARATE, strict, app-level post-filter on top: when active, a larger
// (but still bounded — MAX_RETRIEVAL_MATCH_COUNT, retrieval's own already-
// established ceiling, never unbounded) candidate set is requested so
// there's enough room to filter from without merely running out of
// candidates that happened to rank just above the cutoff; the strict
// matchesPriceReference() filter is then applied (which only ever removes
// elements, so match_products()'s similarity ordering is preserved, never
// weakened or re-sorted); the result is capped back down to the normal
// DEFAULT_RETRIEVAL_MATCH_COUNT before being returned, so
// generateGroundedRecommendation() always receives a normally-bounded
// candidate list regardless of whether a preference was active.
//
// Throws on any other failure along the way (invalid/empty input, a
// Gemini failure, a retrieval failure) — same controlled-failure contract
// as searchProductsFromNaturalLanguage() above. Never falls back to a
// fabricated intent, context, or products.
export async function searchProductsWithShoppingContext(
  userInput: string,
  previousContext: ShoppingContext | null,
): Promise<ShoppingContextSearchResult> {
  const update = await extractShoppingContextUpdate(userInput, previousContext);
  const turnInput = await buildShoppingContextTurnInput(update);
  const context = mergeShoppingContext(previousContext, turnInput);

  if (!context.semanticQuery) {
    return { context, products: [], priceReference: null };
  }

  const priceReference = await resolvePriceReference(context.pricePreference, context.recommendedProductIds);

  // requestedCount ("show me 3 electronics") is a one-off per-turn
  // modifier from `update` (lib/ai/intent.ts's ShoppingIntentUpdate), never
  // part of durable ShoppingContext — same restriction
  // ShoppingIntent.requestedCount already has in the original single-turn
  // pipeline above. Without threading it through here, this deterministic
  // "how many" control would be silently bypassed in the context-aware
  // path — retrieval would always use the untargeted default/price-
  // reference candidate count, leaving "how many" entirely up to Gemini's
  // own judgment during grounding instead of the app's own retrieval
  // scoping, which is not this project's "LLM = language, application =
  // control" principle.
  const requestedCount = update.requestedCount ?? undefined;

  const products = await semanticProductSearch({
    query: context.semanticQuery,
    minPrice: context.minPrice ?? undefined,
    maxPrice: context.maxPrice ?? undefined,
    categoryId: context.categoryId ?? undefined,
    matchCount: priceReference ? MAX_RETRIEVAL_MATCH_COUNT : requestedCount,
  });

  if (!priceReference) {
    return { context, products, priceReference: null };
  }

  const filtered = products.filter((product) => matchesPriceReference(Number(product.price), priceReference));
  const finalCap = requestedCount ?? DEFAULT_RETRIEVAL_MATCH_COUNT;

  return { context, products: filtered.slice(0, finalCap), priceReference };
}
