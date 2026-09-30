import Link from "next/link";

import type { Category } from "@/lib/catalog/types";

import { Stagger, StaggerItem } from "./motion/reveal";

// The storefront category card, shared by the homepage "Shop by category"
// row and the /categories index so both always render the same design.
// `index` only drives the small decorative ordinal in the corner; it sits
// after the name in the DOM so the name stays the card's first text.
export function CategoryCard({ category, index }: { category: Category; index?: number }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="card card-interactive group relative flex h-full min-h-36 flex-col justify-between gap-6 overflow-hidden p-4 sm:min-h-40 sm:p-5"
    >
      {/* Faint accent wash that fades in on hover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_100%,var(--accent-soft),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <span className="relative flex flex-col gap-1 pr-8">
        {/* Break only an over-long single word, so it can't overflow the card. */}
        <span className="font-semibold tracking-tight [overflow-wrap:anywhere]">{category.name}</span>
        {category.description && (
          <span className="line-clamp-2 text-sm text-muted">{category.description}</span>
        )}
      </span>
      {index !== undefined && (
        <span
          aria-hidden="true"
          className="absolute right-4 top-4 font-mono text-xs tabular-nums text-subtle transition-colors group-hover:text-accent sm:right-5 sm:top-5"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      <span
        aria-hidden="true"
        className="relative flex size-9 items-center justify-center self-end rounded-full bg-fill text-muted transition-[background-color,color,transform] duration-300 ease-[var(--ease-nexora)] group-hover:-rotate-45 group-hover:bg-foreground group-hover:text-background"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M4 10h12m-5-5 5 5-5 5" />
        </svg>
      </span>
    </Link>
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <Stagger as="ul" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((category, index) => (
        <StaggerItem as="li" key={category.id}>
          <CategoryCard category={category} index={index} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
