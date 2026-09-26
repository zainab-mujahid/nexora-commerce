"use client";

import { useActionState } from "react";

import { addToWishlist, removeWishlistItem } from "@/lib/wishlist/actions";

// The server decides which of these two states to render (via
// wishlistItemId) — after either action revalidates, the page re-fetches
// wishlist status fresh, so the button flips to the other state on its own
// rather than needing client-side toggle logic.
export function WishlistButton({
  productId,
  wishlistItemId,
}: {
  productId: string;
  wishlistItemId: string | null;
}) {
  if (wishlistItemId) {
    return (
      <form action={removeWishlistItem.bind(null, wishlistItemId)}>
        <button type="submit" className="btn btn-secondary">
          Remove from wishlist
        </button>
      </form>
    );
  }

  return <AddToWishlistForm productId={productId} />;
}

function AddToWishlistForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    addToWishlist.bind(null, productId),
    undefined,
  );

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary"
        >
          {pending ? "Saving…" : "Add to wishlist"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </div>
  );
}
