import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { requireUser } from "@/lib/auth/dal";
import { getAddresses } from "@/lib/addresses/queries";
import { getCartSummary } from "@/lib/cart/queries";

import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  // getCartSummary()/getAddresses() already gate on requireUser() — this
  // repeats the check at the page level too, the same defense-in-depth
  // convention app/cart/page.tsx and app/account/addresses/page.tsx follow.
  await requireUser();

  const [{ items, subtotal }, addresses] = await Promise.all([
    getCartSummary(),
    getAddresses(),
  ]);

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <EmptyState
          title="Your cart is empty"
          message="Add items to your cart before checking out."
        />
        <Link href="/products" className="link-action self-start text-sm">
          Continue shopping
        </Link>
      </main>
    );
  }

  // A fast, client-visible signal only — place_order() re-validates
  // availability and stock authoritatively regardless of what this renders.
  // item.product is null when RLS hides an inactive product from this
  // customer's own SELECT (see the CartItem["product"] comment in
  // lib/cart/queries.ts) — that's exactly as blocking as any other
  // unavailability.
  const hasBlockingIssue = items.some(
    (item) =>
      !item.product ||
      !item.product.is_active ||
      item.product.stock <= 0 ||
      item.quantity > item.product.stock,
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>

      {hasBlockingIssue && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Some items in your cart are no longer available.{" "}
          <Link href="/cart" className="font-medium underline">
            Review your cart
          </Link>{" "}
          before placing your order.
        </p>
      )}

      <CheckoutForm
        items={items}
        subtotal={subtotal}
        addresses={addresses}
        disableSubmit={hasBlockingIssue}
      />
    </main>
  );
}
