import Link from "next/link";
import type { Metadata } from "next";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import { EmptyState } from "@/app/_components/empty-state";
import { ProductGrid } from "@/app/_components/product-grid";
import { ProductSearchInput } from "@/app/_components/product-search-input";
import { getCategories } from "@/lib/catalog/categories";
import { searchProducts, type ProductSort } from "@/lib/catalog/products";

export const metadata: Metadata = {
  title: "Shop",
};

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A to Z" },
];

type CurrentParams = {
  q?: string;
  category?: string;
  sort?: string;
};

// Builds a /products href from the current filters plus overrides (e.g. a
// different page or a toggled category), dropping any key whose final value
// is empty — used so pagination links never silently discard the search
// term or sort order already in effect. Category pills and "All" pass
// q: undefined on purpose: category navigation starts a fresh browse (no
// leftover search), and since no page is carried it also resets to page 1.
function buildHref(current: CurrentParams, overrides: Record<string, string | undefined>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  const q = firstValue(sp.q)?.trim() || undefined;
  const category = firstValue(sp.category) || undefined;
  const sortParam = firstValue(sp.sort);
  const sort: ProductSort = SORT_OPTIONS.some((option) => option.value === sortParam)
    ? (sortParam as ProductSort)
    : "newest";
  const pageParam = Number(firstValue(sp.page));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const [{ products, totalCount, totalPages }, categories] = await Promise.all([
    searchProducts({ q, categorySlug: category, sort, page }),
    getCategories(),
  ]);

  const currentParams: CurrentParams = {
    q,
    category,
    sort: sort === "newest" ? undefined : sort,
  };
  const hasFilters = Boolean(q || category);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
        {totalCount > 0 && (
          <p className="text-sm text-muted">
            {totalCount} product{totalCount === 1 ? "" : "s"}
            {q ? ` matching "${q}"` : ""}
          </p>
        )}
      </div>

      {/* key: category links navigate client-side and keep this form mounted,
          and defaultValue only applies on mount — without re-keying, the
          input would keep showing a search that is no longer in the URL. */}
      <form
        key={`${q ?? ""}|${sort}|${category ?? ""}`}
        action="/products"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        {category && <input type="hidden" name="category" value={category} />}
        <ProductSearchInput className="w-full max-w-sm" defaultValue={q ?? ""} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Sort by</span>
            <select
              name="sort"
              defaultValue={sort}
              className="field"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn btn-secondary"
          >
            Apply
          </button>
        </div>
      </form>

      {categories.length > 0 && (
        <div data-catalog-nav className="flex flex-wrap gap-2">
          <Link
            href={buildHref(currentParams, { category: undefined, q: undefined })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              !category
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-muted hover:border-input hover:text-foreground"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={buildHref(currentParams, {
                category: category === cat.slug ? undefined : cat.slug,
                q: undefined,
              })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat.slug
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface text-muted hover:border-input hover:text-foreground"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      {/* Independent of the server-rendered filters/grid: per-browser AI
          recommendations/chat/view state. Chat/context survive search/
          filter/sort/pagination navigations, but catalogKey changing on
          such a navigation dismisses any showing recommendations so the new
          grid is visible (a later AI answer takes over again). The normal
          catalog content below (heading + grid/EmptyState + pagination) is
          passed as `children` — already fully
          server-rendered here, using this request's `products`/`page`/
          `totalPages` — and AiShoppingAssistant only decides whether to
          show it or the AI Recommendations section in its place. Existing
          URL search/category/sort/page state is never touched by that
          decision. No recommendationsSectionClassName — this relies on this
          page's own <main> (max-w-6xl/gap-6/padding) for the "AI
          Recommendations" section's container, same as before. */}
      <AiShoppingAssistant
        catalogKey={buildHref(currentParams, { page: page > 1 ? String(page) : undefined })}
      >
        <div className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold tracking-tight">All Products</h2>
        </div>

        {products.length === 0 ? (
          <EmptyState
            message={
              hasFilters
                ? "No products match your search or filters."
                : "No products are available right now."
            }
          />
        ) : (
          <>
            <ProductGrid products={products} />

            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
                {page > 1 ? (
                  <Link
                    href={buildHref(currentParams, { page: String(page - 1) })}
                    className="link-action"
                  >
                    &larr; Previous
                  </Link>
                ) : (
                  <span className="text-foreground/30" aria-disabled="true">
                    &larr; Previous
                  </span>
                )}
                <span className="text-muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildHref(currentParams, { page: String(page + 1) })}
                    className="link-action"
                  >
                    Next &rarr;
                  </Link>
                ) : (
                  <span className="text-foreground/30" aria-disabled="true">
                    Next &rarr;
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </AiShoppingAssistant>
    </main>
  );
}
