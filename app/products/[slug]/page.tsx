import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ProductImageDisplay } from "@/app/_components/product-image-display";
import { StockBadge } from "@/app/_components/stock-badge";
import { formatPrice } from "@/lib/catalog/format";
import { getProductBySlug } from "@/lib/catalog/products";

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) return {};

  return { title: product.name };
}

export default async function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:flex-row sm:px-6">
      <ProductImageDisplay
        images={product.images}
        alt={product.name}
        className="aspect-square w-full rounded-md sm:w-80 sm:shrink-0"
      />

      <div className="flex flex-1 flex-col gap-4">
        {product.category && (
          <Link
            href={`/categories/${product.category.slug}`}
            className="text-xs font-medium text-foreground/60 hover:text-foreground"
          >
            {product.category.name}
          </Link>
        )}

        <h1 className="text-2xl font-semibold tracking-tight">
          {product.name}
        </h1>

        <div className="flex items-center gap-3">
          <span className="text-lg text-foreground/80">
            {formatPrice(product.price)}
          </span>
          <StockBadge stock={product.stock} />
        </div>

        {product.description && (
          <p className="text-sm text-foreground/70">{product.description}</p>
        )}
      </div>
    </main>
  );
}
