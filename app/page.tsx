import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import { CategoryGrid } from "@/app/_components/category-card";
import {
  FeaturedProducts,
  FeaturedProductsSkeleton,
} from "@/app/_components/featured-products";
import { HeroTypewriter } from "@/app/_components/hero-typewriter";
import { getProfile, getUser } from "@/lib/auth/dal";
import { getCategories } from "@/lib/catalog/categories";
import type { Category } from "@/lib/catalog/types";

// One desktop row of the category grid. More than this links to the full
// /categories index instead of making the homepage grow with the catalog.
const HOME_CATEGORY_LIMIT = 4;

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
        <div className="hero-banner hero-surface relative overflow-hidden rounded-2xl border border-border px-6 py-12 shadow-[var(--shadow-card)] sm:px-12 sm:py-16 lg:flex lg:min-h-[24rem] lg:items-center">
          {/* Banner artwork as a decorative background layer (alt=""): the
              copy stays on its dark left side. From 1024px the image is
              anchored right, and from 768px at 82%, so the whole cart stays
              in view beside the copy (which keeps to the left half). Below
              768px there is no room for both, so the image is anchored to
              its dark left side and zoomed from the left edge, keeping the
              cart out of frame rather than under the text. Served as-is: it is
              already a compact WebP. */}
          <Image
            src="/images/nexora-hero.webp"
            alt=""
            fill
            unoptimized
            loading="eager"
            fetchPriority="high"
            className="object-cover object-[0%_50%] max-md:origin-left max-md:scale-[1.35] md:object-[82%_50%] lg:object-[100%_45%]"
          />
          <div aria-hidden="true" className="hero-banner-overlay" />
          {/* Decorative ambient layer behind the copy (see .hero-ambient). */}
          <div aria-hidden="true" className="hero-ambient">
            <span className="hero-orb hero-orb-a" />
            <span className="hero-orb hero-orb-b" />
            <span className="hero-orb hero-orb-c" />
          </div>
          <div className="relative flex max-w-2xl flex-col gap-5 md:max-w-[50%] lg:max-w-[52%]">
            <div className="flex flex-col gap-2">
              {/* xl: one line at 42px (~506px wide) ends clear of the floating gift
                  box in the artwork; narrower widths wrap. */}
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl xl:text-[2.625rem] xl:leading-none">
                Shop smarter with Nexora.
              </h1>
              <HeroTypewriter className="text-2xl font-semibold tracking-tight text-foreground/75 sm:text-3xl" />
            </div>
            <p className="max-w-xl text-lg leading-relaxed text-foreground/80 text-pretty">
              {user
                ? `Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}. Your next favorite find is waiting.`
                : "Everyday products, thoughtfully curated. Sign up to start shopping."}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link href="/products" className="btn btn-primary btn-lg">
                Shop now
              </Link>
              {!user && (
                <Link href="/signup" className="btn btn-secondary btn-lg">
                  Create an account
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section
          aria-labelledby="home-categories-heading"
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-12 sm:px-6 sm:pt-16"
        >
          <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
            <h2 id="home-categories-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Shop by category
            </h2>
            {categories.length > HOME_CATEGORY_LIMIT && (
              <Link href="/categories" className="link-action shrink-0 text-sm">
                View all <span aria-hidden="true">&rarr;</span>
              </Link>
            )}
          </div>
          <CategoryGrid categories={categories.slice(0, HOME_CATEGORY_LIMIT)} />
        </section>
      )}

      {/* Only the product-browsing section (FeaturedProducts) is passed as
          children, swapped out for AI Recommendations when active and
          restored exactly as-is (still server-rendered, not re-fetched) via
          "View All Products". The hero and categories above stay outside —
          always visible, never hidden by recommendation mode. */}
      <div className="pt-12 sm:pt-16">
        <AiShoppingAssistant recommendationsSectionClassName="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Suspense fallback={<FeaturedProductsSkeleton />}>
            <FeaturedProducts />
          </Suspense>
        </AiShoppingAssistant>
      </div>
    </main>
  );
}
