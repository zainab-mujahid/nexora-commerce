import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StockBadge } from "@/app/_components/stock-badge";
import { getUser } from "@/lib/auth/dal";
import { Reveal, Stagger, StaggerItem } from "@/app/_components/motion/reveal";
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <Reveal trigger="mount" rise={6}>
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
      </Reveal>

      {/* Imagery and product information share the row evenly (24rem
          centred gallery on small screens). From lg, where the gallery adds
          its vertical thumbnail rail, its column is a fixed 29.5rem (rail
          included) so the main image stays medium-sized and fits a desktop
          viewport; the information column takes the rest. */}
      <div className="mt-4 grid gap-6 sm:mt-5 md:grid-cols-2 md:gap-10 lg:grid-cols-[minmax(0,29.5rem)_minmax(0,1fr)] lg:gap-14">
        <Reveal trigger="mount" rise={0} scale={0.985} className="md:sticky md:top-24 md:self-start">
          <ProductImageGallery images={product.images} alt={product.name} className="mx-auto w-full max-w-sm md:mx-0 lg:max-w-none" />
        </Reveal>

        <Stagger trigger="mount" delay={0.08} className="flex flex-col gap-5">
          <StaggerItem className="flex flex-col gap-3">
            {product.category && <span className="eyebrow">{product.category.name}</span>}
            <h1 className="display-title text-[1.375rem] leading-snug break-words sm:text-2xl lg:text-[1.75rem] lg:leading-tight">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xl font-semibold tracking-tight tabular-nums sm:text-[1.375rem]">
                {formatPrice(product.price)}
              </span>
              <StockBadge stock={product.stock} />
            </div>
          </StaggerItem>

          {product.description && (
            <StaggerItem as="p" className="border-t border-border pt-5 text-base leading-relaxed text-muted text-pretty">
              {product.description}
            </StaggerItem>
          )}

          <StaggerItem className="card flex flex-col gap-3 p-4 sm:p-5">
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
          </StaggerItem>
        </Stagger>
      </div>
    </main>
  );
}
