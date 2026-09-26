"use client";

import { removeCartItem } from "@/lib/cart/actions";

export function RemoveCartItemButton({ cartItemId }: { cartItemId: string }) {
  return (
    <form action={removeCartItem.bind(null, cartItemId)}>
      <button type="submit" className="link-action link-danger text-sm">
        Remove
      </button>
    </form>
  );
}
