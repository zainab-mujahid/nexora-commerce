import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { ProductGrid } from "@/app/_components/product-grid";
import { getCategories } from "@/lib/catalog/categories";
import { getActiveProducts } from "@/lib/catalog/products";

export const metadata: Metadata = {
  title: "Shop",
};

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([
    getActiveProducts(),
    getCategories(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
            >
              {category.name}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState message="No products are available right now." />
      ) : (
        <ProductGrid products={products} />
      )}
    </main>
  );
}
