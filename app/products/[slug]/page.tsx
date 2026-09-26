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
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:flex-row sm:px-6">
      <ProductImageGallery
        images={product.images}
        alt={product.name}
        className="sm:w-80 sm:shrink-0 sm:self-start"
      />

      <div className="flex flex-1 flex-col gap-4">
        {product.category && (
          <Link
            href={`/categories/${product.category.slug}`}
            className="text-xs font-medium text-muted hover:text-foreground"
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
          <p className="text-sm text-muted">{product.description}</p>
        )}

        {!product.is_active ? (
          <p className="text-sm text-muted">
            This product isn&apos;t available for purchase.
          </p>
        ) : user ? (
          <AddToCartForm productId={product.id} maxQuantity={product.stock} />
        ) : (
          <Link
            href="/login"
            className="btn btn-primary self-start"
          >
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
    </main>
  );
}
