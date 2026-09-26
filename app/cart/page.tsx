import Link from "next/link";
import type { Metadata } from "next";

import { pickDisplayImage } from "@/app/_components/product-image-display";
import { ProductImageFrame } from "@/app/_components/product-image-frame";
import { ShoppingEmptyState } from "@/app/_components/shopping-empty-state";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getCartSummary } from "@/lib/cart/queries";

import { RemoveCartItemButton } from "./remove-cart-item-button";
import { UpdateQuantityForm } from "./update-quantity-form";

export const metadata: Metadata = {
  title: "Cart",
};

const THUMB = "size-20 shrink-0 rounded-md ring-1 ring-inset ring-border sm:size-24";

export default async function CartPage() {
  // getCartSummary()/getCartItems() already gate on requireUser() — this
  // repeats the check at the page level too, the same defense-in-depth
  // convention app/account/page.tsx already follows.
  await requireUser();

  const { items, subtotal } = await getCartSummary();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cart</h1>

      {items.length === 0 ? (
        <ShoppingEmptyState icon="bag" message="Your cart is empty." />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          {/* Item rows are the list's only <li>s (browser tests read them). */}
          <ul className="card divide-y divide-border">
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
                  <li key={item.id} className="flex gap-4 p-4 sm:gap-5 sm:p-5">
                    <ProductImageFrame
                      image={pickDisplayImage(label?.images ?? [])}
                      alt={label?.name ?? "Unavailable product"}
                      className={`${THUMB} opacity-60`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <p className="font-medium text-muted [overflow-wrap:anywhere]">
                        {label?.name ?? "Unavailable item"}
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400">No longer available.</p>
                      <div className="mt-auto">
                        <RemoveCartItemButton cartItemId={item.id} />
                      </div>
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
                <li key={item.id} className="flex gap-4 p-4 sm:gap-5 sm:p-5">
                  <ProductImageFrame
                    image={pickDisplayImage(item.product.images)}
                    alt={item.product.name}
                    className={`${THUMB} ${isUnavailable ? "opacity-60" : ""}`}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="font-medium leading-snug underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                        >
                          {item.product.name}
                        </Link>
                        <p className="text-sm text-muted tabular-nums">
                          {formatPrice(item.product.price)} each
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">
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
                      exceedsStock && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Only {item.product.stock} in stock — update the
                          quantity below.
                        </p>
                      )
                    )}

                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      {!isUnavailable && (
                        <UpdateQuantityForm
                          cartItemId={item.id}
                          quantity={item.quantity}
                          maxQuantity={item.product.stock}
                        />
                      )}
                      <div className="ml-auto flex h-9 items-center">
                        <RemoveCartItemButton cartItemId={item.id} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <section
            aria-labelledby="cart-summary-heading"
            className="card flex flex-col gap-5 p-5 sm:p-6 lg:sticky lg:top-8"
          >
            <h2 id="cart-summary-heading" className="text-lg font-semibold tracking-tight">
              Order summary
            </h2>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-5 text-base font-semibold">
              <span>Subtotal</span>
              <span className="text-xl tracking-tight tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/checkout" className="btn btn-primary btn-lg w-full">
                Proceed to checkout
              </Link>
              <Link href="/products" className="link-action self-center text-sm text-muted">
                Continue shopping
              </Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
