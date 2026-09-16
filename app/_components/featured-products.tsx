import { ProductGrid, ProductGridSkeleton } from "@/app/_components/product-grid";
import { getActiveProducts } from "@/lib/catalog/products";

const FEATURED_LIMIT = 4;

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
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-24">
      <h2 className="text-lg font-semibold tracking-tight">
        Featured products
      </h2>
      <ProductGrid products={products} />
    </section>
  );
}

export function FeaturedProductsSkeleton() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-24">
      <div className="h-6 w-40 animate-pulse rounded bg-black/5 dark:bg-white/5" />
      <ProductGridSkeleton count={4} />
    </section>
  );
}
