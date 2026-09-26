import Link from "next/link";

import { ProductGrid, ProductGridSkeleton } from "@/app/_components/product-grid";
import { getActiveProducts } from "@/lib/catalog/products";

const FEATURED_LIMIT = 4;

const SECTION_CLASS = "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-24 sm:px-6";

// Unlike the dedicated /products page, a failure here must not take down
// the whole homepage over a secondary section — caught locally instead of
// letting lib/catalog's throw reach a page-level error boundary.
export async function FeaturedProducts() {
  let products;
  try {
    products = await getActiveProducts({ limit: FEATURED_LIMIT });
  } catch {
    return null;
  }

  if (products.length === 0) return null;

  return (
    <section className={SECTION_CLASS}>
      <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Featured products
        </h2>
        <Link href="/products" className="link-action shrink-0 text-sm">
          View all <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
      <ProductGrid products={products} />
    </section>
  );
}

export function FeaturedProductsSkeleton() {
  return (
    <section className={SECTION_CLASS}>
      <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div className="h-7 w-48 rounded bg-fill motion-safe:animate-pulse" />
      </div>
      <ProductGridSkeleton count={4} />
    </section>
  );
}
