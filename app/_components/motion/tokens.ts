// Nexora's motion language, shared by every Framer Motion (motion/react)
// primitive in this folder. Short distances, fast settle, no overshoot on
// content — commerce motion should feel responsive, never slow shopping down.
// The same curve is exposed to CSS as --ease-nexora (app/globals.css).

// A soft "ease-out-quint": quick start, long gentle landing.
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.4,
  slow: 0.6,
} as const;

// Distance (px) content travels on entrance.
export const RISE = 14;

// Delay between siblings in a staggered list/grid.
export const STAGGER = 0.06;

// Physical, lightly damped spring for layout moves (active indicators,
// panels). Settles without visible bounce.
export const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;
