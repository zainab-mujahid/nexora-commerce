"use client";

import { removeWishlistItem } from "@/lib/wishlist/actions";

export function RemoveWishlistItemButton({ wishlistItemId }: { wishlistItemId: string }) {
  return (
    <form action={removeWishlistItem.bind(null, wishlistItemId)}>
      <button type="submit" className="link-action link-danger text-sm">
        Remove
      </button>
    </form>
  );
}
