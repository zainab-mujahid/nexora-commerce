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
    <div className="flex flex-col gap-1.5">
      {/* One joined control: the number field and its Update submit. Same
          explicit-submit behaviour as before, only presented as a group. */}
      <form
        action={formAction}
        className="inline-flex h-9 w-fit items-stretch overflow-hidden rounded-md border border-input bg-surface focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]"
      >
        <input
          type="number"
          name="quantity"
          min={1}
          max={maxQuantity}
          defaultValue={quantity}
          disabled={pending}
          aria-label="Quantity"
          className="w-16 bg-transparent px-2 text-center text-sm font-medium tabular-nums outline-none disabled:cursor-not-allowed disabled:text-subtle"
        />
        <button
          type="submit"
          disabled={pending}
          className="border-l border-input px-3 text-xs font-medium transition-colors hover:bg-fill focus-visible:bg-fill focus-visible:outline-none disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
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
