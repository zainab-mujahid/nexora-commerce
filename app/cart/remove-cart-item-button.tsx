"use client";

import { removeCartItem } from "@/lib/cart/actions";

export function RemoveCartItemButton({ cartItemId }: { cartItemId: string }) {
  return (
    <form action={removeCartItem.bind(null, cartItemId)}>
      <button type="submit" className="text-sm text-red-600 hover:opacity-70">
        Remove
      </button>
    </form>
  );
}
