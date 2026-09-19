"use client";

import { useActionState } from "react";

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

  if (maxQuantity < 1) {
    return <p className="text-sm text-foreground/60">Out of stock.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="number"
          name="quantity"
          min={1}
          max={maxQuantity}
          defaultValue={1}
          disabled={pending}
          aria-label="Quantity"
          className="w-20 rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-green-600">
          {state.message ?? "Added to cart."}
        </p>
      )}
    </form>
  );
}
