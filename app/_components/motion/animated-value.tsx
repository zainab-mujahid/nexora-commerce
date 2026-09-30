"use client";

import { m } from "motion/react";
import { useState } from "react";

import { DURATION, EASE } from "./tokens";

// A server-rendered value (e.g. a cart line total or subtotal) that eases in
// when it changes after a re-render — confirming that an update landed. The
// first render shows it as-is (nothing animates on page load), and the text
// is always the real value: only its entrance is animated.
export function AnimatedValue({ value }: { value: string }) {
  const [initialValue] = useState(value);
  const changed = value !== initialValue;

  return (
    <m.span
      key={value}
      className="inline-block"
      initial={changed ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast * 1.5, ease: EASE }}
    >
      {value}
    </m.span>
  );
}
