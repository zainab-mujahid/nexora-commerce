import Link from "next/link";
import { Suspense } from "react";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import { CategoryGrid } from "@/app/_components/category-card";
import {
  FeaturedProducts,
  FeaturedProductsSkeleton,
} from "@/app/_components/featured-products";
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
        <div className="hero-surface overflow-hidden rounded-2xl border border-border px-6 py-12 shadow-[var(--shadow-card)] sm:px-12 sm:py-16">
          <div className="flex max-w-2xl flex-col gap-5">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Nexora Commerce
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted text-pretty">
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
