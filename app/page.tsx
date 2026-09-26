import Link from "next/link";
import { Suspense } from "react";

import { AiShoppingAssistant } from "@/app/_components/ai-shopping-assistant";
import {
  FeaturedProducts,
  FeaturedProductsSkeleton,
} from "@/app/_components/featured-products";
import { getProfile, getUser } from "@/lib/auth/dal";
import { getCategories } from "@/lib/catalog/categories";
import type { Category } from "@/lib/catalog/types";

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
          <div className="border-b border-border pb-4">
            <h2 id="home-categories-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Shop by category
            </h2>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="group flex h-full flex-col justify-between gap-6 rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-input sm:p-5"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold tracking-tight">{category.name}</span>
                    {category.description && (
                      <span className="line-clamp-2 text-sm text-muted">{category.description}</span>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center self-end rounded-full bg-fill text-muted transition-colors group-hover:bg-foreground group-hover:text-background"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M4 10h12m-5-5 5 5-5 5" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
