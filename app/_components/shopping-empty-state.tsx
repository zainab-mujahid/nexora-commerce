import Link from "next/link";

import { Reveal } from "./motion/reveal";

// Empty cart / empty wishlist: same message as before, plus the existing
// storefront route back to shopping. Presentation only.
export function ShoppingEmptyState({
  message,
  icon,
}: {
  message: string;
  icon: "bag" | "heart";
}) {
  return (
    <Reveal trigger="mount" scale={0.985} className="surface-glow flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-fill/40 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface text-accent shadow-[var(--shadow-card)] ring-1 ring-border">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          {icon === "bag" ? (
            <>
              <path d="M5 8h14l-1 12H6L5 8Z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </>
          ) : (
            <path d="M12 20s-7.5-4.5-7.5-10A4 4 0 0 1 12 7.5 4 4 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10Z" />
          )}
        </svg>
      </span>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Link href="/products" className="btn btn-secondary">
        Continue shopping
      </Link>
    </Reveal>
  );
}
