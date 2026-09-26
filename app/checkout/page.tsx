import Link from "next/link";
import type { Metadata } from "next";

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
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutHeading />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-fill/40 px-6 py-16 text-center">
          <p className="font-medium">Your cart is empty</p>
          <p className="max-w-sm text-sm text-muted">Add items to your cart before checking out.</p>
          <Link href="/products" className="btn btn-secondary mt-2">
            Continue shopping
          </Link>
        </div>
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <CheckoutHeading />

      {hasBlockingIssue && (
        <p className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="mt-0.5 size-4 shrink-0">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6.5v4M10 13.5h.01" />
          </svg>
          <span>
            Some items in your cart are no longer available.{" "}
            <Link href="/cart" className="font-medium underline">
              Review your cart
            </Link>{" "}
            before placing your order.
          </span>
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

// Page heading plus a quiet way back to the cart (a plain link — checkout
// holds no state of its own to lose).
function CheckoutHeading() {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/cart" className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
        <span aria-hidden="true">&larr;</span> Back to cart
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>
    </div>
  );
}
