import Link from "next/link";
import { Suspense } from "react";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import { CategoryGrid } from "@/app/_components/category-card";
import {
  FeaturedProducts,
  FeaturedProductsSkeleton,
} from "@/app/_components/featured-products";
import { HeroCarousel } from "@/app/_components/hero-carousel";
import { HeroTypewriter } from "@/app/_components/hero-typewriter";
import { Stagger, StaggerItem } from "@/app/_components/motion/reveal";
import { SectionHeader } from "@/app/_components/section-header";
import { getProfile, getUser } from "@/lib/auth/dal";
import { getCategories } from "@/lib/catalog/categories";
import type { Category } from "@/lib/catalog/types";

// One desktop row of the category grid. More than this links to the full
// /categories index instead of making the homepage grow with the catalog.
const HOME_CATEGORY_LIMIT = 4;

// What the storefront actually offers — each line describes an existing
// feature (the AI assistant, order history/status, wishlist + saved
// addresses). Presentation only; nothing here links or fetches.
const HIGHLIGHTS = [
  {
    title: "AI shopping assistant",
    body: "Describe what you need and get matching picks from our catalog.",
    icon: "M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6L10 2.5z",
  },
  {
    title: "Order tracking",
    body: "Follow every order's status from your account.",
    icon: "M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3Zm3 4h4m-4 3h4",
  },
  {
    title: "Wishlist & saved addresses",
    body: "Save favorites for later and check out in a few taps.",
    icon: "M10 16.5s-6.5-3.9-6.5-8.6A3.4 3.4 0 0 1 10 5.8a3.4 3.4 0 0 1 6.5 2.1c0 4.7-6.5 8.6-6.5 8.6Z",
  },
];

// Same cached getCategories() the header already calls for every page (so
// no extra query); like the header, a failure only hides the category row.
async function getHomeCategories(): Promise<Category[]> {
  try {
    return await getCategories();
  } catch {
    return [];
  }
}

export default async function Home() {
  // user is the authentication signal (matches proxy.ts); profile is display
  // enrichment only and must not decide whether we treat someone as a guest.
  const [user, profile, categories] = await Promise.all([
    getUser(),
    getProfile(),
    getHomeCategories(),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
        <div className="hero-banner hero-surface relative overflow-hidden rounded-2xl border border-border px-6 py-12 shadow-[var(--shadow-raised)] sm:px-12 sm:py-16 lg:flex lg:min-h-[26rem] lg:items-center">
          {/* Banner artwork: three decorative photos (alt="") that crossfade
              in one fixed background layer, with per-image crops so the
              products sit beside the copy (see HeroCarousel). */}
          <HeroCarousel />
          <div aria-hidden="true" className="hero-banner-overlay" />
          {/* Decorative ambient layer behind the copy (see .hero-ambient). */}
          <div aria-hidden="true" className="hero-ambient">
            <span className="hero-orb hero-orb-a" />
            <span className="hero-orb hero-orb-b" />
            <span className="hero-orb hero-orb-c" />
          </div>
          <Stagger
            trigger="mount"
            delay={0.1}
            step={0.08}
            className="relative flex max-w-2xl flex-col gap-5 md:max-w-[50%] lg:max-w-[52%]"
          >
            <StaggerItem>
              <span className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.06] px-3 py-1 text-xs font-medium tracking-wide text-foreground/85">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                Curated everyday essentials
              </span>
            </StaggerItem>
            <StaggerItem className="flex flex-col gap-2">
              {/* xl: one line at 42px (~506px wide) ends clear of the floating gift
                  box in the artwork; narrower widths wrap. */}
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl xl:text-[2.625rem] xl:leading-none">
                Shop smarter, with Nexora.
              </h1>
              <HeroTypewriter className="text-2xl font-semibold tracking-tight text-foreground/75 sm:text-3xl" />
            </StaggerItem>
            <StaggerItem as="p" className="max-w-xl text-lg leading-relaxed text-foreground/80 text-pretty">
              {user
                ? `Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}. Your next favorite find is waiting.`
                : "Everyday products, thoughtfully curated. Sign up to start shopping."}
            </StaggerItem>
            <StaggerItem className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link href="/products" className="group/cta btn btn-primary btn-lg">
                Shop now
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4 transition-transform duration-300 ease-[var(--ease-nexora)] group-hover/cta:translate-x-0.5">
                  <path d="M4 10h12m-5-5 5 5-5 5" />
                </svg>
              </Link>
              {!user && (
                <Link href="/signup" className="btn btn-secondary btn-lg">
                  Create an account
                </Link>
              )}
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section aria-label="Why shop with Nexora" className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        <Stagger as="ul" className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <StaggerItem as="li" key={item.title} className="flex items-start gap-3.5 bg-surface p-5">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
                  <path d={item.icon} />
                </svg>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{item.title}</span>
                <span className="text-sm leading-relaxed text-muted">{item.body}</span>
              </span>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {categories.length > 0 && (
        <section
          aria-labelledby="home-categories-heading"
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-14 sm:px-6 sm:pt-20"
        >
          <SectionHeader
            eyebrow="Browse"
            id="home-categories-heading"
            title="Shop by category"
            action={
              categories.length > HOME_CATEGORY_LIMIT && (
                <Link href="/categories" className="link-action shrink-0 text-sm">
                  View all <span aria-hidden="true">&rarr;</span>
                </Link>
              )
            }
          />
          <CategoryGrid categories={categories.slice(0, HOME_CATEGORY_LIMIT)} />
        </section>
      )}

      {/* Only the product-browsing section (FeaturedProducts) is passed as
          children, swapped out for AI Recommendations when active and
          restored exactly as-is (still server-rendered, not re-fetched) via
          "View All Products". The hero and categories above stay outside —
          always visible, never hidden by recommendation mode. */}
      <div className="pt-14 sm:pt-20">
        <AiShoppingAssistant recommendationsSectionClassName="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Suspense fallback={<FeaturedProductsSkeleton />}>
            <FeaturedProducts />
          </Suspense>
        </AiShoppingAssistant>
      </div>
    </main>
  );
}
