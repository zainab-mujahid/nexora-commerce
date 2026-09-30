"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";

import { DURATION, EASE } from "./tokens";

// Mounted once in the root layout around the page content. LazyMotion +
// `m.*` components (strict) keeps Framer Motion's feature code in one shared
// chunk instead of in every component that animates. domMax is needed for
// layoutId (shared active indicators).
//
// reducedMotion="user": when the OS asks for reduced motion, every transform
// animation (movement/scale) is skipped and only opacity changes remain —
// nothing in the app depends on the motion itself.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
