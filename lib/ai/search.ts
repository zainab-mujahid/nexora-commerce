import "server-only";

import { getCategories } from "@/lib/catalog/categories";

import { extractShoppingIntent, type ShoppingIntent } from "./intent";
import { semanticProductSearch, type SemanticProductSearchResult } from "./retrieval";

// Deterministic, exact-match only — never fuzzy/LLM-assisted. Gemini
// extracts category as free text (e.g. "shoes") and has no access to the
// categories table; it must never be allowed to invent or guess a
// categories.id. This is the one place that raw text is allowed to become
// a real database id, and only by matching it against categories that
// actually exist right now. No match -> null, never a fabricated id.
async function resolveCategoryId(categoryText: string | null): Promise<string | null> {
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
