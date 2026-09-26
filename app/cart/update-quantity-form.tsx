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
          className="field h-8 min-h-8 w-16 px-2 py-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "Updating…" : "Update"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state && "success" in state && state.message && (
        <p className="text-xs text-muted">{state.message}</p>
      )}
    </div>
  );
}
