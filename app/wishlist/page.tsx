import Link from "next/link";
import type { Metadata } from "next";

import { pickDisplayImage } from "@/app/_components/product-image-display";
import { ProductImageFrame } from "@/app/_components/product-image-frame";
import { ShoppingEmptyState } from "@/app/_components/shopping-empty-state";
import { StockBadge } from "@/app/_components/stock-badge";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getWishlistItems } from "@/lib/wishlist/queries";

import { MoveToCartButton } from "./move-to-cart-button";
import { RemoveWishlistItemButton } from "./remove-wishlist-item-button";

export const metadata: Metadata = {
  title: "Wishlist",
};

const FRAME = "aspect-square w-full rounded-lg ring-1 ring-inset ring-border";

export default async function WishlistPage() {
  // getWishlistItems() already gates on requireUser() — this repeats the
  // check at the page level too, the same defense-in-depth convention
  // app/account/page.tsx and app/cart/page.tsx already follow.
  await requireUser();

  const items = await getWishlistItems();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Wishlist</h1>

      {items.length === 0 ? (
        <ShoppingEmptyState icon="heart" message="Your wishlist is empty." />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
          {items.map((item) => {
            // The product was deactivated after being wishlisted and RLS
            // (products_select_active_or_admin) now hides it from this
            // customer — see WishlistItem["product"] in
            // lib/wishlist/queries.ts. Only item.unavailableProduct's name
            // and one image are shown (generic fallback if that lookup came
            // back empty) — no link, price, stock, or Move to cart; Remove
            // stays available so the customer can clear the line.
            if (!item.product) {
              const label = item.unavailableProduct;
              return (
                <li key={item.id} className="flex flex-col gap-3">
                  <ProductImageFrame
                    image={pickDisplayImage(label?.images ?? [])}
                    alt={label?.name ?? "Unavailable product"}
                    className={`${FRAME} opacity-60`}
                  />
                  <div className="flex flex-1 flex-col gap-1.5 px-0.5">
                    <p className="line-clamp-2 text-sm font-medium leading-5 text-muted [overflow-wrap:anywhere]">
                      {label?.name ?? "Unavailable item"}
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400">No longer available.</p>
                    <div className="mt-auto flex justify-center pt-2">
                      <RemoveWishlistItemButton wishlistItemId={item.id} />
                    </div>
                  </div>
                </li>
              );
            }

            const isUnavailable = !item.product.is_active || item.product.stock <= 0;

            return (
              // One product link per item (tests rely on it): the name link
              // stretches over the whole card via ::after, and the actions
              // sit above it (relative z-10) so they stay clickable.
              <li
                key={item.id}
                className="group relative flex flex-col gap-3 rounded-lg has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ring"
              >
                <ProductImageFrame
                  image={pickDisplayImage(item.product.images)}
                  alt={item.product.name}
                  className={`${FRAME} transition-shadow duration-300 group-hover:shadow-[var(--shadow-float)] ${isUnavailable ? "opacity-60" : ""}`}
                  imgClassName="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
                />

                <div className="flex flex-1 flex-col gap-1.5 px-0.5">
                  <Link
                    href={`/products/${item.product.slug}`}
                    className="line-clamp-2 text-sm font-medium leading-5 decoration-foreground/40 underline-offset-4 [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none group-hover:underline"
                  >
                    {item.product.name}
                  </Link>
                  <p className="text-base font-semibold tracking-tight tabular-nums">
                    {formatPrice(item.product.price)}
                  </p>

                  {isUnavailable ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {item.product.is_active
                        ? "Out of stock."
                        : "No longer available."}
                    </p>
                  ) : (
                    <StockBadge stock={item.product.stock} />
                  )}

                  <div className="relative z-10 mt-auto flex flex-col items-stretch gap-1 pt-3">
                    {!isUnavailable && <MoveToCartButton wishlistItemId={item.id} />}
                    <div className="flex justify-center">
                      <RemoveWishlistItemButton wishlistItemId={item.id} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
