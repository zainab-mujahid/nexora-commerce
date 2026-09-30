"use client";

import { m } from "motion/react";

// The filled part of one recovery progress segment. The current step's fill
// sweeps in from the left when its screen appears; completed steps render
// already full.
export function StepFill({ animate }: { animate: boolean }) {
  return (
    <m.span
      aria-hidden="true"
      className="absolute inset-0 origin-left rounded-full bg-foreground"
      initial={animate ? { scaleX: 0 } : false}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.6, delay: 0.15 }}
    />
  );
}
