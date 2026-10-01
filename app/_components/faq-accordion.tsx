"use client";

import { AnimatePresence, m, useIsPresent, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";

import { DURATION, EASE } from "./motion/tokens";

export type FaqItem = { question: string; answer: ReactNode };

// Disclosure list for /faqs: each question is a real <button> with
// aria-expanded/aria-controls, its answer a labelled region. Several answers
// can be open at once. Opening is a short height + opacity ease, instant
// under prefers-reduced-motion.
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const baseId = useId();
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const reduceMotion = useReducedMotion();

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="card divide-y divide-border">
      {items.map((item, index) => {
        const isOpen = open.has(index);
        const buttonId = `${baseId}-q${index}`;
        const panelId = `${baseId}-a${index}`;
        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex min-h-12 w-full items-center justify-between gap-4 px-5 py-4 text-left text-[0.9375rem] font-medium transition-colors hover:bg-fill/60 focus-visible:-outline-offset-2 sm:px-6"
              >
                {item.question}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`size-4 shrink-0 text-muted transition-transform duration-200 ease-[var(--ease-nexora)] motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                >
                  <path d="m5.5 8 4.5 4.5L14.5 8" />
                </svg>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <FaqPanel key="answer" id={panelId} labelledBy={buttonId} instant={!!reduceMotion}>
                  {item.answer}
                </FaqPanel>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// One answer. While it animates closed it is already `inert`, so its links
// leave the tab order immediately instead of after the collapse finishes.
function FaqPanel({
  id,
  labelledBy,
  instant,
  children,
}: {
  id: string;
  labelledBy: string;
  instant: boolean;
  children: ReactNode;
}) {
  const isPresent = useIsPresent();
  return (
    <m.div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      inert={!isPresent}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: instant ? 0 : DURATION.base, ease: EASE }}
      className="overflow-hidden"
    >
      <div className="info-prose flex flex-col gap-3 px-5 pb-5 sm:px-6">{children}</div>
    </m.div>
  );
}
