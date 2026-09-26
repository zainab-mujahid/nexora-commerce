"use client";

import { removeWishlistItem } from "@/lib/wishlist/actions";

export function RemoveWishlistItemButton({ wishlistItemId }: { wishlistItemId: string }) {
  return (
    <form action={removeWishlistItem.bind(null, wishlistItemId)}>
      <button type="submit" className="link-action link-danger inline-flex h-9 items-center gap-1.5 text-sm">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M4 6h12M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6" />
        </svg>
        Remove
      </button>
    </form>
  );
}
