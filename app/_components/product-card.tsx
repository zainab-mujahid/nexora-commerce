import Link from "next/link";

import { formatPrice } from "@/lib/catalog/format";
import type { ProductListItem } from "@/lib/catalog/types";

import { ProductImageDisplay } from "./product-image-display";
import { StockBadge } from "./stock-badge";

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="card card-interactive flex flex-col gap-3 p-3"
    >
      <ProductImageDisplay
        images={product.images}
        alt={product.name}
        className="aspect-square w-full rounded-md"
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{product.name}</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatPrice(product.price)}
        </span>
        <StockBadge stock={product.stock} />
      </div>
    </Link>
  );
}
