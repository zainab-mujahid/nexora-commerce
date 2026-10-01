import type { Metadata } from "next";
import Link from "next/link";

import { EditorialImage } from "@/app/_components/editorial-image";
import { InfoHero, InfoMain } from "@/app/_components/info-page";
import { Reveal, Stagger, StaggerItem } from "@/app/_components/motion/reveal";

export const metadata: Metadata = {
  title: "About Nexora",
  description:
    "Nexora Commerce is a modern multi-category store built around simpler product discovery, thoughtful shopping tools and AI-assisted browsing.",
};

const PRINCIPLES = [
  {
    title: "Thoughtful Discovery",
    body: "Products organized into clear categories, so browsing across very different kinds of products stays easy.",
    icon: "M8.5 3.5h-5v5h5v-5Zm8 0h-5v5h5v-5Zm-8 8h-5v5h5v-5Zm8 0h-5v5h5v-5Z",
  },
  {
    title: "Clear Experience",
    body: "Straightforward product pages — images where available, description, price and current stock — and a shopping flow without detours.",
    icon: "M4 5h12M4 10h12M4 15h7",
  },
  {
    title: "Customer Control",
    body: "Cart, wishlist, saved addresses and order history keep everything you're considering and buying organized in one account.",
    icon: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7a6 6 0 0 1 12 0",
  },
  {
    title: "Intelligent Assistance",
    body: "An AI shopping assistant that helps you explore products available in the Nexora catalog, in plain language.",
    icon: "M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6L10 2.5z",
  },
] as const;

export default function AboutPage() {
  return (
    <InfoMain>
      <InfoHero
        eyebrow="About Nexora"
        title="Everyday shopping, thoughtfully simplified."
        intro={
          <>
            <p>
              Nexora Commerce is a modern shopping experience designed to make discovering, comparing and buying products
              across different categories simple and intuitive.
            </p>
            <p className="mt-3">
              We bring product discovery, organized browsing, useful account tools and intelligent shopping assistance
              together in one clean experience — whether you&apos;re looking for something specific or just exploring.
            </p>
          </>
        }
      />

      {/* Text | Image */}
      <section aria-labelledby="about-story" className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal className="flex flex-col gap-4">
          <span className="eyebrow">Our story</span>
          <h2 id="about-story" className="display-title text-3xl sm:text-4xl">
            Discover differently.
          </h2>
          <div className="info-prose flex flex-col gap-4">
            <p>
              Online shopping often means endless scrolling, crowded pages and too many tabs open at once. Nexora started
              from a simple idea: finding the right product should feel calm and focused, not overwhelming.
            </p>
            <p>
              Instead of specializing in a single niche, Nexora brings different product categories together under one
              consistent experience. The same clear layout, the same product details and the same tools follow you from
              one category to the next — so moving from discovery to a confident decision takes fewer steps.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <EditorialImage
            src="/images/about-discovery.webp"
            className="aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
          />
        </Reveal>
      </section>

      {/* Image | Text (image first on wide screens, text first when stacked) */}
      <section aria-labelledby="about-experience" className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal className="flex flex-col gap-4 lg:order-2">
          <span className="eyebrow">The experience</span>
          <h2 id="about-experience" className="display-title text-3xl sm:text-4xl">
            Built around the way you shop.
          </h2>
          <div className="info-prose flex flex-col gap-4">
            <p>
              Every part of Nexora is designed to keep shopping straightforward. Browse the full catalog or a single
              category, search by name or by describing what you need, and open any product for its description, price,
              current availability and images where available.
            </p>
            <p>
              Your account brings the practical tools together: a <strong>wishlist</strong> for products you want to
              revisit, a <strong>cart</strong> that keeps quantities in line with what&apos;s in stock, saved{" "}
              <strong>shipping addresses</strong>, and an <strong>order history</strong> that shows the status of each
              order. Nexora works the same on phone, tablet and desktop, in light or dark mode.
            </p>
          </div>
        </Reveal>
        <Reveal className="lg:order-1">
          <EditorialImage
            src="/images/about-experience.webp"
            className="aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
          />
        </Reveal>
      </section>

      <Reveal as="section" aria-labelledby="about-ai" className="info-callout card grid gap-6 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12">
        <div className="flex flex-col gap-3">
          <span className="eyebrow">Smarter discovery</span>
          <h2 id="about-ai" className="display-title text-3xl">
            A shopping assistant that knows the catalog.
          </h2>
        </div>
        <div className="info-prose flex flex-col gap-4">
          <p>
            Nexora includes an AI shopping assistant on the home and shop pages. Describe what you&apos;re looking for in
            your own words — a budget, a use, a style — and it suggests matching products from the Nexora catalog and
            explains why they fit.
          </p>
          <p>
            It understands follow-up questions within the same conversation, and every product it suggests links to its
            real product page, so the final decision is always based on the product information shown there.
          </p>
        </div>
      </Reveal>

      <section aria-labelledby="about-principles" className="flex flex-col gap-6">
        <Reveal className="flex flex-col gap-2 border-b border-border pb-4">
          <span className="eyebrow">What guides us</span>
          <h2 id="about-principles" className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            The Nexora principles
          </h2>
        </Reveal>
        <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((item) => (
            <StaggerItem as="li" key={item.title} className="card flex flex-col gap-3 p-6">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                  <path d={item.icon} />
                </svg>
              </span>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{item.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <Reveal as="section" aria-label="Start shopping" className="flex flex-col items-start gap-4 border-t border-border pt-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-medium tracking-tight">Ready to explore the catalog?</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/products" className="btn btn-primary">
            Shop products
          </Link>
          <Link href="/contact" className="btn btn-secondary">
            Contact us
          </Link>
        </div>
      </Reveal>
    </InfoMain>
  );
}
