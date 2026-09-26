import Link from "next/link";

import type { Category } from "@/lib/catalog/types";

// The storefront category card, shared by the homepage "Shop by category"
// row and the /categories index so both always render the same design.
export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex h-full flex-col justify-between gap-6 rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-input sm:p-5"
    >
      <span className="flex flex-col gap-1">
        {/* Break only an over-long single word, so it can't overflow the card. */}
        <span className="font-semibold tracking-tight [overflow-wrap:anywhere]">{category.name}</span>
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
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((category) => (
        <li key={category.id}>
          <CategoryCard category={category} />
        </li>
      ))}
    </ul>
  );
}
