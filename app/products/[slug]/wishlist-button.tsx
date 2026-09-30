"use client";

import { m } from "motion/react";
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
        <button type="submit" className="btn btn-secondary btn-lg w-full">
          <HeartIcon filled />
          Remove from wishlist
        </button>
      </form>
    );
  }

  return <AddToWishlistForm productId={productId} />;
}

// The filled (saved) heart mounts when the server re-renders this button in
// its saved state, and gives one small "pop"; the outline heart nudges up on
// hover. Decorative only.
function HeartIcon({ filled }: { filled: boolean }) {
  const path = (
    <path d="M10 16.5s-6.5-3.9-6.5-8.6A3.4 3.4 0 0 1 10 5.8a3.4 3.4 0 0 1 6.5 2.1c0 4.7-6.5 8.6-6.5 8.6Z" />
  );
  if (filled) {
    return (
      <m.svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="size-4 text-danger"
        initial={{ scale: 0.6 }}
        animate={{ scale: [0.6, 1.25, 1] }}
        transition={{ duration: 0.45, times: [0, 0.55, 1] }}
      >
        {path}
      </m.svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      className="size-4 transition-transform duration-200 group-hover/wish:scale-110"
    >
      {path}
    </svg>
  );
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
          className="group/wish btn btn-secondary btn-lg w-full"
        >
          <HeartIcon filled={false} />
          {pending ? "Saving…" : "Add to wishlist"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </div>
  );
}
