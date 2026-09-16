import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { ProductGrid } from "@/app/_components/product-grid";
import { getProductsByCategory } from "@/lib/catalog/products";

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProductsByCategory(slug);

  if (!result) return {};

  return { title: result.category.name };
}

export default async function CategoryPage({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const result = await getProductsByCategory(slug);

  if (!result) notFound();

  const { category, products } = result;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {category.name}
        </h1>
        {category.description && (
          <p className="text-sm text-foreground/60">{category.description}</p>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState message="No products in this category yet." />
      ) : (
        <ProductGrid products={products} />
      )}
    </main>
  );
}
