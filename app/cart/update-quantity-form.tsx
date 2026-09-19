"use client";

import { useActionState } from "react";

import { updateCartItemQuantity } from "@/lib/cart/actions";

export function UpdateQuantityForm({
  cartItemId,
  quantity,
  maxQuantity,
}: {
  cartItemId: string;
  quantity: number;
  maxQuantity: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateCartItemQuantity.bind(null, cartItemId),
    undefined,
  );

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex items-center gap-2">
        <input
          type="number"
          name="quantity"
          min={1}
          max={maxQuantity}
          defaultValue={quantity}
          disabled={pending}
          aria-label="Quantity"
          className="w-16 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:opacity-70 disabled:opacity-60 dark:border-white/20"
        >
          {pending ? "Updating…" : "Update"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      {state && "success" in state && state.message && (
        <p className="text-xs text-foreground/60">{state.message}</p>
      )}
    </div>
  );
}
