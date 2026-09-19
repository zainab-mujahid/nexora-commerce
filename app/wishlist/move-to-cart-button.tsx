"use client";

import { useActionState } from "react";

import { moveWishlistItemToCart } from "@/lib/wishlist/actions";

// No visible "moved" confirmation on success: a successful move deletes the
// wishlist row and revalidates, so this row's own re-render removes it from
// the list in the same commit — the item disappearing IS the confirmation,
// same as RemoveWishlistItemButton. Only the error case needs to render
// here, since that's the one outcome that leaves the row in place.
export function MoveToCartButton({ wishlistItemId }: { wishlistItemId: string }) {
  const [state, formAction, pending] = useActionState(
    moveWishlistItemToCart.bind(null, wishlistItemId),
    undefined,
  );

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:opacity-70 disabled:opacity-60 dark:border-white/20"
        >
          {pending ? "Moving…" : "Move to cart"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </div>
  );
}
