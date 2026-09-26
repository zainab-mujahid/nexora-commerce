import Link from "next/link";
import type { Metadata } from "next";

import { CatalogEmptyState } from "@/app/_components/catalog-empty-state";
import { CategoryGrid } from "@/app/_components/category-card";
import { getCategories } from "@/lib/catalog/categories";

export const metadata: Metadata = {
  title: "Categories",
};

// Every category, using the same cached getCategories() as the header and
// homepage. A failed read throws to this segment's error boundary, like
// the products listing page.
export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/products" className="nav-link">
            Shop
          </Link>
          <span aria-hidden="true" className="px-2 text-subtle">/</span>
          <span aria-current="page" className="text-foreground">Categories</span>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Categories</h1>
        {categories.length > 0 && (
          <p className="text-sm text-subtle">
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </p>
        )}
      </div>

      {categories.length === 0 ? (
        <CatalogEmptyState message="No categories are available right now." />
      ) : (
        <CategoryGrid categories={categories} />
      )}
    </main>
  );
}
