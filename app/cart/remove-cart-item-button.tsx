"use client";

import { removeCartItem } from "@/lib/cart/actions";

export function RemoveCartItemButton({ cartItemId }: { cartItemId: string }) {
  return (
    <form action={removeCartItem.bind(null, cartItemId)}>
      <button type="submit" className="link-action link-danger inline-flex items-center gap-1.5 text-sm">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M4 6h12M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6" />
        </svg>
        Remove
      </button>
    </form>
  );
}
