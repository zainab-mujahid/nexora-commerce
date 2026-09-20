import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { ProductGrid } from "@/app/_components/product-grid";
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
// is empty — used so pagination links and category pills never silently
// discard the search term or sort order already in effect.
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
          <p className="text-sm text-foreground/60">
            {totalCount} product{totalCount === 1 ? "" : "s"}
            {q ? ` matching "${q}"` : ""}
          </p>
        )}
      </div>

      <form
        action="/products"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full max-w-sm rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground/60">Sort by</span>
            <select
              name="sort"
              defaultValue={sort}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
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
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:opacity-70 dark:border-white/20"
          >
            Apply
          </button>
        </div>
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref(currentParams, { category: undefined })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !category
                ? "border-foreground bg-foreground text-background"
                : "border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={buildHref(currentParams, {
                category: category === cat.slug ? undefined : cat.slug,
              })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                category === cat.slug
                  ? "border-foreground bg-foreground text-background"
                  : "border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

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
                  className="hover:opacity-70"
                >
                  &larr; Previous
                </Link>
              ) : (
                <span className="text-foreground/30" aria-disabled="true">
                  &larr; Previous
                </span>
              )}
              <span className="text-foreground/60">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={buildHref(currentParams, { page: String(page + 1) })}
                  className="hover:opacity-70"
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
    </main>
  );
}
