import Link from "next/link";
import type { ReactNode } from "react";

import { Reveal } from "./motion/reveal";
import {
  SUPPORT_ADDRESS_LINES,
  SUPPORT_EMAIL,
  SUPPORT_HOURS_LINES,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_HREF,
} from "./support-contact";

// Shared presentation for the storefront's information pages (/about,
// /contact, /faqs and the policy pages). Built only from the existing tokens
// and helpers (.eyebrow, .display-title, .card); body copy is styled by
// .info-prose in app/globals.css.

// Page opening: eyebrow, title, introduction and an optional "Last updated".
export function InfoHero({
  eyebrow,
  title,
  intro,
  updated,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  updated?: string;
}) {
  return (
    <Reveal trigger="mount" className="flex max-w-3xl flex-col gap-4 border-b border-border pb-8 sm:pb-10">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="display-title text-4xl sm:text-5xl">{title}</h1>
      <div className="text-lg leading-relaxed text-muted text-pretty">{intro}</div>
      {updated && <p className="text-xs font-medium text-subtle">Last updated: {updated}</p>}
    </Reveal>
  );
}

export function InfoMain({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:gap-12 sm:px-6 sm:py-14">
      {children}
    </main>
  );
}

// A titled block of prose on the About/Contact/FAQ pages.
export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="info-prose flex flex-col gap-4">{children}</div>
    </Reveal>
  );
}

export type LegalSection = { id: string; title: string; body: ReactNode };

// Long-form policy layout: numbered sections in a reading column, with an
// "On this page" index beside them on wide screens (above them on small
// ones), and the support callout at the end.
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <InfoMain>
      <InfoHero eyebrow={eyebrow} title={title} intro={intro} updated={updated} />
      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">On this page</p>
          <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-1">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="nav-link flex gap-2 rounded-sm py-0.5">
                  <span className="w-5 shrink-0 tabular-nums text-subtle">{index + 1}.</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex max-w-3xl flex-col">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-heading`}
              className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-b-0"
            >
              <h2 id={`${section.id}-heading`} className="mb-4 flex gap-3 text-xl font-semibold tracking-tight">
                <span className="tabular-nums text-subtle">{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </h2>
              <div className="info-prose flex flex-col gap-4">{section.body}</div>
            </section>
          ))}
          <SupportCallout className="mt-6" />
        </div>
      </div>
    </InfoMain>
  );
}

// Closing "need help?" panel with the display contact details.
export function SupportCallout({
  title = "Questions about this policy?",
  className = "",
}: {
  title?: string;
  className?: string;
}) {
  return (
    <aside aria-label="Contact Nexora support" className={`info-callout card flex flex-col gap-5 p-6 sm:p-8 ${className}`}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-muted">
          Our support team can help with products, orders, your account and our policies.
        </p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Email</dt>
          <dd>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="link-action font-medium">
              {SUPPORT_EMAIL}
            </a>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Phone</dt>
          <dd>
            <a href={SUPPORT_PHONE_HREF} className="link-action font-medium">
              {SUPPORT_PHONE_DISPLAY}
            </a>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">Hours</dt>
          <dd className="text-muted">{SUPPORT_HOURS_LINES.join(", ")}</dd>
        </div>
      </dl>
      <p className="text-xs text-subtle">
        {SUPPORT_ADDRESS_LINES.join(", ")} ·{" "}
        <Link href="/contact" className="link-action">
          All contact options
        </Link>
      </p>
    </aside>
  );
}
