import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { ProductImageDisplay } from "@/app/_components/product-image-display";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getCartSummary } from "@/lib/cart/queries";

import { RemoveCartItemButton } from "./remove-cart-item-button";
import { UpdateQuantityForm } from "./update-quantity-form";

export const metadata: Metadata = {
  title: "Cart",
};

export default async function CartPage() {
  // getCartSummary()/getCartItems() already gate on requireUser() — this
  // repeats the check at the page level too, the same defense-in-depth
  // convention app/account/page.tsx already follows.
  await requireUser();

  const { items, subtotal } = await getCartSummary();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>

      {items.length === 0 ? (
        <EmptyState message="Your cart is empty." />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {items.map((item) => {
              // The product row still exists (product_id cascades on delete,
              // so a deleted product's cart_items row would be gone too) but
              // is no longer visible to this customer's own SELECT — RLS
              // (products_select_active_or_admin) hides an inactive product
              // from anyone but an admin, including through this embed.
              // item.unavailableProduct (name + image, sourced without
              // relying on that hidden row — see lib/cart/queries.ts) is
              // what lets this line still say *which* product it is.
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
                      <p className="text-sm text-red-600 dark:text-red-400">No longer available.</p>
                      <RemoveCartItemButton cartItemId={item.id} />
                    </div>
                  </li>
                );
              }

              const isOutOfStock = item.product.stock <= 0;
              const isUnavailable = !item.product.is_active || isOutOfStock;
              const exceedsStock =
                item.product.is_active &&
                !isOutOfStock &&
                item.quantity > item.product.stock;

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
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div>
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="font-medium hover:opacity-70"
                        >
                          {item.product.name}
                        </Link>
                        <p className="text-sm text-foreground/60">
                          {formatPrice(item.product.price)} each
                        </p>
                      </div>
                      <p className="font-medium">
                        {formatPrice(Number(item.product.price) * item.quantity)}
                      </p>
                    </div>

                    {isUnavailable ? (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {item.product.is_active
                          ? "Out of stock."
                          : "No longer available."}
                      </p>
                    ) : (
                      <>
                        {exceedsStock && (
                          <p className="text-sm text-red-600 dark:text-red-400">
                            Only {item.product.stock} in stock — update the
                            quantity below.
                          </p>
                        )}
                        <UpdateQuantityForm
                          cartItemId={item.id}
                          quantity={item.quantity}
                          maxQuantity={item.product.stock}
                        />
                      </>
                    )}

                    <RemoveCartItemButton cartItemId={item.id} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t border-black/10 pt-4 text-lg font-semibold dark:border-white/10">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>

          <Link
            href="/checkout"
            className="self-end rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90"
          >
            Proceed to checkout
          </Link>
        </>
      )}
    </main>
  );
}
