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
    return <p className="text-sm text-foreground/60">Out of stock.</p>;
  }

  const canDecrease = !pending && quantity > 1;
  const canIncrease = !pending && quantity < maxQuantity;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div
          role="group"
          aria-label="Quantity"
          className="inline-flex w-fit items-center overflow-hidden rounded-md border border-black/15 dark:border-white/20"
        >
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={!canDecrease}
            onClick={() => canDecrease && setQuantity((q) => q - 1)}
            className="flex h-9 w-9 items-center justify-center text-sm font-medium hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &minus;
          </button>
          <span
            aria-live="polite"
            className="w-10 border-x border-black/15 py-2 text-center text-sm tabular-nums dark:border-white/20"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={!canIncrease}
            onClick={() => canIncrease && setQuantity((q) => q + 1)}
            className="flex h-9 w-9 items-center justify-center text-sm font-medium hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
        <input type="hidden" name="quantity" value={quantity} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-green-600">
          {state.message ?? "Added to cart."}
        </p>
      )}
    </form>
  );
}
