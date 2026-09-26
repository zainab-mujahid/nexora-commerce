"use client";

import { useActionState, useState } from "react";

import { addToCart } from "@/lib/cart/actions";

export function AddToCartForm({
  productId,
  maxQuantity,
}: {
  productId: string;
  maxQuantity: number;
}) {
  const [state, formAction, pending] = useActionState(
    addToCart.bind(null, productId),
    undefined,
  );
  const [quantity, setQuantity] = useState(1);

  if (maxQuantity < 1) {
    return <p className="text-sm text-muted">Out of stock.</p>;
  }

  const canDecrease = !pending && quantity > 1;
  const canIncrease = !pending && quantity < maxQuantity;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div
          role="group"
          aria-label="Quantity"
          className="inline-flex w-fit items-center overflow-hidden rounded-md border border-input bg-surface"
        >
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={!canDecrease}
            onClick={() => canDecrease && setQuantity((q) => q - 1)}
            className="flex h-[2.125rem] w-9 items-center justify-center text-sm font-medium transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
          >
            &minus;
          </button>
          <span
            aria-live="polite"
            className="w-10 border-x border-input py-1.5 text-center text-sm tabular-nums"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={!canIncrease}
            onClick={() => canIncrease && setQuantity((q) => q + 1)}
            className="flex h-[2.125rem] w-9 items-center justify-center text-sm font-medium transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
          >
            +
          </button>
        </div>
        <input type="hidden" name="quantity" value={quantity} />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {/* text-green-600 stays as this message's identifying class (existing
          browser tests select `p.text-green-600`); the important
          text-success sets the actual, contrast-safe color. */}
      {state && "success" in state && (
        <p className="text-sm text-green-600 text-success!">
          {state.message ?? "Added to cart."}
        </p>
      )}
    </form>
  );
}
