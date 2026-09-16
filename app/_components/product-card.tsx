import Link from "next/link";

import { formatPrice } from "@/lib/catalog/format";
import type { ProductListItem } from "@/lib/catalog/types";

import { ProductImagePlaceholder } from "./product-image-placeholder";
import { StockBadge } from "./stock-badge";

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex flex-col gap-2 rounded-md border border-black/10 p-3 transition-colors hover:border-black/25 dark:border-white/10 dark:hover:border-white/25"
    >
      <ProductImagePlaceholder className="aspect-square w-full rounded-md" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{product.name}</span>
        <span className="text-sm text-foreground/70">
          {formatPrice(product.price)}
        </span>
        <StockBadge stock={product.stock} />
      </div>
    </Link>
  );
}
