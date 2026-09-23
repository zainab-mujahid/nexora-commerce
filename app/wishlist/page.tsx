import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { ProductImageDisplay } from "@/app/_components/product-image-display";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getWishlistItems } from "@/lib/wishlist/queries";

import { MoveToCartButton } from "./move-to-cart-button";
import { RemoveWishlistItemButton } from "./remove-wishlist-item-button";

export const metadata: Metadata = {
  title: "Wishlist",
};

export default async function WishlistPage() {
  // getWishlistItems() already gates on requireUser() — this repeats the
  // check at the page level too, the same defense-in-depth convention
  // app/account/page.tsx and app/cart/page.tsx already follow.
  await requireUser();

  const items = await getWishlistItems();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>

      {items.length === 0 ? (
        <EmptyState message="Your wishlist is empty." />
      ) : (
        <ul className="flex flex-col gap-4">
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
                <li
                  key={item.id}
                  className="flex gap-4 rounded-md border border-black/10 p-4 opacity-70 dark:border-white/10"
                >
                  <ProductImageDisplay
                    images={label?.images ?? []}
                    alt={label?.name ?? "Unavailable product"}
                    className="h-24 w-24 shrink-0 rounded-md"
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <p className="font-medium">{label?.name ?? "Unavailable item"}</p>
                    <p className="text-sm text-red-600">No longer available.</p>
                    <RemoveWishlistItemButton wishlistItemId={item.id} />
                  </div>
                </li>
              );
            }

            const isUnavailable = !item.product.is_active || item.product.stock <= 0;

            return (
              <li
                key={item.id}
                className="flex gap-4 rounded-md border border-black/10 p-4 dark:border-white/10"
              >
                <ProductImageDisplay
                  images={item.product.images}
                  alt={item.product.name}
                  className="h-24 w-24 shrink-0 rounded-md"
                />

                <div className="flex flex-1 flex-col gap-2">
                  <div>
                    <Link
                      href={`/products/${item.product.slug}`}
                      className="font-medium hover:opacity-70"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-foreground/60">
                      {formatPrice(item.product.price)}
                    </p>
                  </div>

                  {isUnavailable ? (
                    <p className="text-sm text-red-600">
                      {item.product.is_active
                        ? "Out of stock."
                        : "No longer available."}
                    </p>
                  ) : (
                    <MoveToCartButton wishlistItemId={item.id} />
                  )}

                  <RemoveWishlistItemButton wishlistItemId={item.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
