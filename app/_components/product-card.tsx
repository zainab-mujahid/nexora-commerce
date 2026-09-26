import Link from "next/link";

import { formatPrice } from "@/lib/catalog/format";
import type { ProductListItem } from "@/lib/catalog/types";

import { pickDisplayImage } from "./product-image-display";
import { ProductImageFrame } from "./product-image-frame";
import { StockBadge } from "./stock-badge";

// One link per product (the whole tile is the click target). The product
// name is deliberately the first text in the link and the price the first
// amount — browser tests read cards that way.
export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex h-full flex-col gap-3 rounded-lg focus-visible:outline-offset-4"
    >
      <ProductImageFrame
        image={pickDisplayImage(product.images)}
        alt={product.name}
        className="aspect-square w-full rounded-lg ring-1 ring-inset ring-border transition-shadow duration-300 group-hover:shadow-[var(--shadow-float)]"
        imgClassName="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
      />
      <div className="flex flex-1 flex-col gap-1.5 px-0.5">
        <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground decoration-foreground/40 underline-offset-4 group-hover:underline">
          {product.name}
        </span>
        {/* mt-auto: price + stock sit on a shared baseline across a grid
            row even when a neighbouring title wraps to two lines. */}
        <span className="mt-auto flex flex-col gap-1.5">
          <span className="text-base font-semibold tracking-tight tabular-nums">
            {formatPrice(product.price)}
          </span>
          <StockBadge stock={product.stock} />
        </span>
      </div>
    </Link>
  );
}
