import type { ProductListItem } from "@/lib/catalog/types";

import { ProductCard } from "./product-card";

// Shared by the grid and its skeleton so loading and loaded layouts match.
const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <div className={GRID_CLASS}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 motion-safe:animate-pulse">
          <div className="aspect-square rounded-lg bg-fill" />
          <div className="flex flex-col gap-1.5 px-0.5">
            <div className="h-5 w-4/5 rounded bg-fill" />
            <div className="h-5 w-2/5 rounded bg-fill" />
            <div className="h-6 w-1/3 rounded bg-fill" />
            <div className="h-4 w-1/4 rounded bg-fill" />
          </div>
        </div>
      ))}
    </div>
  );
}
