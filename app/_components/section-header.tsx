import type { ReactNode } from "react";

import { Reveal } from "./motion/reveal";

// Storefront section heading: an eyebrow label, the title, and an optional
// action (e.g. "View all") on the right, over a hairline rule. The title
// stays a real heading element with the id the section references.
export function SectionHeader({
  eyebrow,
  title,
  id,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <Reveal className="flex items-end justify-between gap-4 border-b border-border pb-4">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {title}
        </h2>
      </div>
      {action}
    </Reveal>
  );
}
