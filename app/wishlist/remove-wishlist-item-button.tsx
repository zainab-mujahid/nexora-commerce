"use client";

import { removeWishlistItem } from "@/lib/wishlist/actions";

export function RemoveWishlistItemButton({ wishlistItemId }: { wishlistItemId: string }) {
  return (
    <form action={removeWishlistItem.bind(null, wishlistItemId)}>
      <button type="submit" className="text-sm text-red-600 hover:opacity-70">
        Remove
      </button>
    </form>
  );
}
