import type { ProductImage } from "@/lib/catalog/types";

import { ProductImagePlaceholder } from "./product-image-placeholder";

// images arrive already ordered by sort_order (queried that way in
// lib/catalog/products.ts) — is_primary is still checked explicitly first
// since a product isn't required to have one flagged as primary.
function pickDisplayImage(images: ProductImage[]): ProductImage | null {
  if (images.length === 0) return null;
  return images.find((image) => image.is_primary) ?? images[0];
}

export function ProductImageDisplay({
  images,
  alt,
  className = "",
}: {
  images: ProductImage[];
  alt: string;
  className?: string;
}) {
  const image = pickDisplayImage(images);

  if (!image) {
    return <ProductImagePlaceholder className={className} />;
  }

  // S3_PUBLIC_BASE_URL is only known at runtime from env, so next/image's
  // static remotePatterns config can't target it without hardcoding a
  // deployment-specific domain — a plain <img> is used instead.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={image.alt_text || alt} className={`object-cover ${className}`} />;
}
