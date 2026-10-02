import { randomUUID } from "node:crypto";

import Link from "next/link";
import type { Metadata } from "next";

import { Reveal } from "@/app/_components/motion/reveal";
import { requireUser } from "@/lib/auth/dal";
import { getAddresses } from "@/lib/addresses/queries";
import { getCartSummary } from "@/lib/cart/queries";
import { getOwnActiveCheckout } from "@/lib/checkout/queries";
import { getPaymentAvailability } from "@/lib/payments/presentation";

import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  // getCartSummary()/getAddresses() already gate on requireUser() — this
  // repeats the check at the page level too, the same defense-in-depth
  // convention app/cart/page.tsx and app/account/addresses/page.tsx follow.
  await requireUser();

  const [{ items, subtotal }, addresses, activeCheckout] = await Promise.all([
    getCartSummary(),
    getAddresses(),
    getOwnActiveCheckout(),
  ]);

  // A payment already in progress: continue (or cancel) that one rather than
  // reserving the cart a second time. Its items are already held, which is
  // also why the cart's stock figures would look short here.
  if (activeCheckout) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutHeading />
        <div className="card surface-glow mx-auto flex w-full max-w-xl flex-col items-center gap-3 p-8 text-center">
          <p className="font-medium">You have a payment in progress</p>
          <p className="max-w-sm text-sm text-muted">
            Your items are reserved while you finish paying. Continue that payment, or cancel it to start again.
          </p>
          <Link href={`/checkout/payment/${activeCheckout.id}`} className="btn btn-primary mt-2">
            Continue payment
          </Link>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutHeading />
        <div className="surface-glow flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-fill/40 px-6 py-16 text-center">
          <p className="font-medium">Your cart is empty</p>
          <p className="max-w-sm text-sm text-muted">Add items to your cart before checking out.</p>
          <Link href="/products" className="btn btn-secondary mt-2">
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  // A fast, client-visible signal only — begin_checkout() re-validates
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
        idempotencyKey={randomUUID()}
        payment={getPaymentAvailability()}
      />
    </main>
  );
}

// Page heading plus a quiet way back to the cart (a plain link — checkout
// holds no state of its own to lose).
function CheckoutHeading() {
  return (
    <Reveal trigger="mount" className="flex flex-col gap-3">
      <Link href="/cart" className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
        <span aria-hidden="true">&larr;</span> Back to cart
      </Link>
      <h1 className="display-title text-3xl sm:text-4xl">Checkout</h1>
    </Reveal>
  );
}
