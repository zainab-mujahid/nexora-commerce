import Link from "next/link";
import type { Metadata } from "next";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import { ActiveIndicator } from "@/app/_components/motion/active-indicator";
import { Reveal } from "@/app/_components/motion/reveal";
import { CatalogEmptyState } from "@/app/_components/catalog-empty-state";
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

// Category filter pills. The selected pill's dark fill is a shared-layout
// indicator (ActiveIndicator) drawn behind the link in a small wrapper, so
// switching category slides it across instead of swapping instantly. The
// link itself keeps just its text label as its content.
const PILL_WRAP = "relative isolate inline-flex rounded-full";
const PILL =
  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200";
const PILL_ON = "border-foreground text-background";
const PILL_OFF = "border-border bg-surface text-muted hover:border-input hover:text-foreground";
const PILL_INDICATOR = "inset-0 -z-10 rounded-full bg-foreground";

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <Reveal trigger="mount" className="flex flex-col gap-3">
        <span className="eyebrow">The collection</span>
        <h1 className="display-title text-4xl sm:text-5xl">
          Explore the Collection
        </h1>
        <p className="max-w-xl text-base text-muted text-pretty">
          Discover products across every category, all in one place.
        </p>
        {totalCount > 0 && (
          <p className="text-sm text-muted">
            {totalCount} product{totalCount === 1 ? "" : "s"}
            {q && (
              <>
                {" "}matching &quot;<span className="font-medium text-foreground">{q}</span>&quot;
              </>
            )}
          </p>
        )}
      </Reveal>

      {/* key: category links navigate client-side and keep this form mounted,
          and defaultValue only applies on mount — without re-keying, the
          input would keep showing a search that is no longer in the URL. */}
      <form
        key={`${q ?? ""}|${sort}|${category ?? ""}`}
        action="/products"
        className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        {category && <input type="hidden" name="category" value={category} />}
        <ProductSearchInput className="w-full sm:max-w-sm" defaultValue={q ?? ""} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-muted">Sort by</span>
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
          <span className={PILL_WRAP}>
            {!category && <ActiveIndicator layoutId="catalog-pill" className={PILL_INDICATOR} />}
            <Link
              href={buildHref(currentParams, { category: undefined, q: undefined })}
              aria-current={!category ? "page" : undefined}
              className={`${PILL} ${!category ? PILL_ON : PILL_OFF}`}
            >
              All
            </Link>
          </span>
          {categories.map((cat) => (
            <span key={cat.id} className={PILL_WRAP}>
              {category === cat.slug && <ActiveIndicator layoutId="catalog-pill" className={PILL_INDICATOR} />}
              <Link
                href={buildHref(currentParams, {
                  category: category === cat.slug ? undefined : cat.slug,
                  q: undefined,
                })}
                aria-current={category === cat.slug ? "page" : undefined}
                className={`${PILL} ${category === cat.slug ? PILL_ON : PILL_OFF}`}
              >
                {cat.name}
              </Link>
            </span>
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
        <div className="border-b border-border pb-4">
          <h2 className="text-2xl font-semibold tracking-tight">All Products</h2>
        </div>

        {products.length === 0 ? (
          <CatalogEmptyState
            icon={hasFilters ? "search" : "box"}
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
              <nav className="flex items-center justify-center gap-3 pt-2 text-sm" aria-label="Pagination">
                {page > 1 ? (
                  <Link
                    href={buildHref(currentParams, { page: String(page - 1) })}
                    className="btn btn-secondary btn-sm"
                  >
                    &larr; Previous
                  </Link>
                ) : (
                  <span className="btn btn-secondary btn-sm cursor-not-allowed opacity-50" aria-disabled="true">
                    &larr; Previous
                  </span>
                )}
                <span className="px-2 text-muted tabular-nums">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildHref(currentParams, { page: String(page + 1) })}
                    className="btn btn-secondary btn-sm"
                  >
                    Next &rarr;
                  </Link>
                ) : (
                  <span className="btn btn-secondary btn-sm cursor-not-allowed opacity-50" aria-disabled="true">
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
