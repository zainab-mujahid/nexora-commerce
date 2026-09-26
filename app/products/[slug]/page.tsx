import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StockBadge } from "@/app/_components/stock-badge";
import { getUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getProductBySlug } from "@/lib/catalog/products";
import { getWishlistItemForProduct } from "@/lib/wishlist/queries";

import { AddToCartForm } from "./add-to-cart-form";
import { ProductImageGallery } from "./product-image-gallery";
import { WishlistButton } from "./wishlist-button";

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
  const [product, user] = await Promise.all([
    getProductBySlug(slug),
    getUser(),
  ]);

  if (!product) notFound();

  const wishlistItem = user
    ? await getWishlistItemForProduct(product.id)
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center text-sm text-muted">
        <Link href="/products" className="nav-link">
          Shop
        </Link>
        {product.category && (
          <>
            <span aria-hidden="true" className="px-2 text-subtle">/</span>
            <Link href={`/categories/${product.category.slug}`} className="nav-link">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <ProductImageGallery
          images={product.images}
          alt={product.name}
          className="md:sticky md:top-8 md:self-start"
        />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatPrice(product.price)}
              </span>
              <StockBadge stock={product.stock} />
            </div>
          </div>

          {product.description && (
            <p className="border-t border-border pt-6 text-base leading-relaxed text-muted text-pretty">
              {product.description}
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
            {!product.is_active ? (
              <p className="text-sm text-muted">
                This product isn&apos;t available for purchase.
              </p>
            ) : user ? (
              <AddToCartForm productId={product.id} maxQuantity={product.stock} />
            ) : (
              <Link href="/login" className="btn btn-primary btn-lg w-full">
                Log in to add to cart
              </Link>
            )}

            {user && (
              <WishlistButton
                productId={product.id}
                wishlistItemId={wishlistItem?.id ?? null}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
