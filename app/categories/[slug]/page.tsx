import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CatalogEmptyState } from "@/app/_components/catalog-empty-state";
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/products" className="nav-link">
            Shop
          </Link>
          <span aria-hidden="true" className="px-2 text-subtle">/</span>
          <span aria-current="page" className="text-foreground">{category.name}</span>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="max-w-2xl text-base text-muted text-pretty">{category.description}</p>
        )}
        {products.length > 0 && (
          <p className="text-sm text-subtle">
            {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <CatalogEmptyState message="No products in this category yet." />
      ) : (
        <ProductGrid products={products} />
      )}
    </main>
  );
}
