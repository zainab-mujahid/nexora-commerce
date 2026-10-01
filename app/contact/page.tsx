import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/app/_components/contact-form";
import { InfoHero, InfoMain } from "@/app/_components/info-page";
import { Reveal, Stagger, StaggerItem } from "@/app/_components/motion/reveal";
import {
  SUPPORT_ADDRESS_LINES,
  SUPPORT_EMAIL,
  SUPPORT_HOURS_LINES,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_HREF,
} from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Contact Nexora",
  description: "Contact Nexora Commerce about products, orders, your account or our policies.",
};

const CARDS = [
  {
    label: "Email",
    lines: [SUPPORT_EMAIL],
    href: `mailto:${SUPPORT_EMAIL}`,
    icon: "M3 5.5h14v9H3v-9Zm0 .5 7 5 7-5",
  },
  {
    label: "Phone",
    lines: [SUPPORT_PHONE_DISPLAY],
    href: SUPPORT_PHONE_HREF,
    icon: "M6.5 3h-2A1.5 1.5 0 0 0 3 4.6C3.3 11 9 16.7 15.4 17a1.5 1.5 0 0 0 1.6-1.5v-2l-3.5-1.5-1.8 1.8a8 8 0 0 1-4.5-4.5L9 7.5 7.5 4 6.5 3Z",
  },
  {
    label: "Address",
    lines: [...SUPPORT_ADDRESS_LINES],
    href: null,
    icon: "M10 17s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0C4.5 12 10 17 10 17Zm0-7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  },
  {
    label: "Business hours",
    lines: [...SUPPORT_HOURS_LINES],
    href: null,
    icon: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-10.5V10l2.5 1.5",
  },
] as const;

const QUICK_LINKS = [
  { href: "/faqs", label: "Frequently asked questions" },
  { href: "/orders", label: "Your orders and their status" },
  { href: "/shipping", label: "Shipping Policy" },
  { href: "/returns", label: "Return & Refund Policy" },
] as const;

export default function ContactPage() {
  return (
    <InfoMain>
      <InfoHero
        eyebrow="Support"
        title="Contact Us"
        intro="Have a question about a product, your account, an order, or using Nexora? We're here to help you find the information you need."
      />

      <section aria-labelledby="contact-details" className="flex flex-col gap-5">
        <h2 id="contact-details" className="sr-only">
          Contact details
        </h2>
        <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <StaggerItem as="li" key={card.label} className="info-callout card flex flex-col gap-4 p-6">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                  <path d={card.icon} />
                </svg>
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{card.label}</h3>
                {card.href ? (
                  <a href={card.href} className="link-action self-start text-[0.9375rem] font-medium [overflow-wrap:anywhere]">
                    {card.lines[0]}
                  </a>
                ) : (
                  <p className="text-[0.9375rem] leading-relaxed">
                    {card.lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="contact-form-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <Reveal className="card flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Get in touch</span>
            <h2 id="contact-form-heading" className="text-2xl font-semibold tracking-tight">
              Write your message
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Write your message here, then copy it into an email to us. Including your order date or the product name
              helps us answer faster.
            </p>
          </div>
          <ContactForm />
        </Reveal>

        <Reveal as="aside" aria-labelledby="contact-quick" className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="contact-quick" className="text-lg font-semibold tracking-tight">
              Find answers quickly
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Many questions are answered in your account or our help pages.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center justify-between gap-3 py-3.5 text-sm font-medium transition-colors hover:text-foreground"
                >
                  {link.label}
                  <span aria-hidden="true" className="text-subtle transition-transform duration-200 ease-[var(--ease-nexora)] group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-subtle">
            Our support hours are {SUPPORT_HOURS_LINES.join(", ")}. For questions about a specific order, please include
            the order date and the email address on your account.
          </p>
        </Reveal>
      </section>
    </InfoMain>
  );
}
