"use client";

import { useState } from "react";

import { pickDisplayImage } from "@/app/_components/product-image-display";
import { ProductImagePlaceholder } from "@/app/_components/product-image-placeholder";
import type { ProductImage } from "@/lib/catalog/types";

// Product detail page only — product cards/listing pages keep using
// ProductImageDisplay (primary/first image, no thumbnails). images arrive
// already ordered by sort_order (lib/catalog/products.ts), which is what
// this renders the thumbnail strip in.
export function ProductImageGallery({
  images,
  alt,
  className = "",
}: {
  images: ProductImage[];
  alt: string;
  className?: string;
}) {
  const initial = pickDisplayImage(images);
  const [selectedId, setSelectedId] = useState(initial?.id ?? null);

  if (images.length === 0 || !initial) {
    return (
      <ProductImagePlaceholder
        className={`aspect-square w-full rounded-md ${className}`}
      />
    );
  }

  const selected = images.find((image) => image.id === selectedId) ?? initial;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- S3_PUBLIC_BASE_URL
          is a runtime env value, not a static domain next/image can target. */}
      <img
        src={selected.url}
        alt={selected.alt_text || alt}
        className="aspect-square w-full rounded-md object-cover"
      />

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image) => {
            const isSelected = image.id === selected.id;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedId(image.id)}
                aria-pressed={isSelected}
                aria-label={image.alt_text || alt}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                  isSelected
                    ? "border-foreground"
                    : "border-transparent hover:border-input"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
