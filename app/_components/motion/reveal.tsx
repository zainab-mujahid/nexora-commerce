"use client";

import { m, type Variants } from "motion/react";
import type { AriaRole, ReactNode } from "react";

import { DURATION, EASE, RISE, SPRING, STAGGER } from "./tokens";

// Presentation-only entrance wrappers for server-rendered content: the server
// component keeps rendering its own markup and passes it in as `children`,
// so data fetching, forms and links are untouched. Each wrapper renders one
// real element of the requested tag (so list semantics like ul > li and
// test selectors keep working) with an entrance animation.
//
// Everything carries data-reveal: the root layout's <noscript> style shows
// it fully without JavaScript.

const TAGS = {
  div: m.div,
  section: m.section,
  header: m.header,
  article: m.article,
  aside: m.aside,
  ul: m.ul,
  ol: m.ol,
  li: m.li,
  p: m.p,
  span: m.span,
  h1: m.h1,
  h2: m.h2,
} as const;

type Tag = keyof typeof TAGS;

type CommonProps = {
  as?: Tag;
  className?: string;
  id?: string;
  role?: AriaRole;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children?: ReactNode;
};

// "mount": plays once when it first renders (above-the-fold content).
// "inView": plays once when scrolled ~15% into view.
type Trigger = "mount" | "inView";

const VIEWPORT = { once: true, amount: 0.15, margin: "0px 0px -6% 0px" } as const;

function triggerProps(trigger: Trigger) {
  return trigger === "mount"
    ? { initial: "hidden", animate: "visible" }
    : { initial: "hidden", whileInView: "visible", viewport: VIEWPORT };
}

const itemVariants = (rise: number, scale: number): Variants => ({
  hidden: { opacity: 0, y: rise, scale },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE } },
});

// A single block that fades up into place.
export function Reveal({
  as = "div",
  trigger = "inView",
  delay = 0,
  rise = RISE,
  scale = 1,
  ...rest
}: CommonProps & { trigger?: Trigger; delay?: number; rise?: number; scale?: number }) {
  const Component = TAGS[as];
  const variants: Variants = {
    hidden: { opacity: 0, y: rise, scale },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE, delay } },
  };
  return <Component data-reveal="" variants={variants} {...triggerProps(trigger)} {...rest} />;
}

// A container whose StaggerItem children enter one after another.
export function Stagger({
  as = "div",
  trigger = "inView",
  delay = 0,
  step = STAGGER,
  ...rest
}: CommonProps & { trigger?: Trigger; delay?: number; step?: number }) {
  const Component = TAGS[as];
  const variants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: step, delayChildren: delay } },
  };
  return <Component data-reveal="" variants={variants} {...triggerProps(trigger)} {...rest} />;
}

// One child of a Stagger. Inherits the parent's hidden/visible state.
//
// `glide`: when a sibling above it is removed (e.g. a cart line after
// Remove), the item slides from its old position into its new one instead
// of jumping. Position only (transform), so nothing resizes or reflows
// mid-animation, and the removed item itself is gone immediately — no
// server action waits on it. Skipped under reduced motion (MotionConfig).
export function StaggerItem({
  as = "div",
  rise = RISE,
  scale = 1,
  glide = false,
  ...rest
}: CommonProps & { rise?: number; scale?: number; glide?: boolean }) {
  const Component = TAGS[as];
  return (
    <Component
      data-reveal=""
      variants={itemVariants(rise, scale)}
      layout={glide ? "position" : undefined}
      transition={glide ? { layout: SPRING } : undefined}
      {...rest}
    />
  );
}
