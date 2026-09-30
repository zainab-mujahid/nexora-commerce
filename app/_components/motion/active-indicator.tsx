"use client";

import { m } from "motion/react";

import { SPRING } from "./tokens";

// The highlight behind (or under) the current item in a set of tabs/pills.
// Rendered only inside the current item; when the current item changes, the
// shared layoutId makes it glide from the old position to the new one
// instead of jumping. Decorative (aria-hidden) — the item itself carries
// aria-current. Its parent must be `relative`.
export function ActiveIndicator({ layoutId, className }: { layoutId: string; className: string }) {
  return (
    <m.span
      aria-hidden="true"
      layoutId={layoutId}
      transition={SPRING}
      className={`pointer-events-none absolute ${className}`}
    />
  );
}
