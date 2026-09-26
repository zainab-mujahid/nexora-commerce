import type { ProductListItem } from "@/lib/catalog/types";

import { ProductCard } from "./product-card";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex animate-pulse flex-col gap-2">
          <div className="aspect-square rounded-md bg-fill" />
          <div className="h-4 w-3/4 rounded bg-fill" />
          <div className="h-4 w-1/3 rounded bg-fill" />
        </div>
      ))}
    </div>
  );
}
