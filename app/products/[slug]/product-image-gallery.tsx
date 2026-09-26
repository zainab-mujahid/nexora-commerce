"use client";

import { useState } from "react";

import { ProductImageFrame } from "@/app/_components/product-image-frame";
import { pickDisplayImage } from "@/app/_components/product-image-display";
import type { ProductImage } from "@/lib/catalog/types";

// Product detail page only — product cards/listing pages show just the
// primary/first image. images arrive already ordered by sort_order
// (lib/catalog/products.ts), which is what this renders the thumbnail strip
// in. The main image is contained (not cropped) in its frame so the whole
// product stays visible whatever the source aspect ratio.
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

  const frame = "aspect-square w-full rounded-xl ring-1 ring-inset ring-border";

  if (images.length === 0 || !initial) {
    return <ProductImageFrame image={null} alt={alt} className={`${frame} ${className}`} />;
  }

  const selected = images.find((image) => image.id === selectedId) ?? initial;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <ProductImageFrame key={selected.id} image={selected} alt={alt} fit="contain" className={frame} />

      {images.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          {images.map((image) => {
            const isSelected = image.id === selected.id;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedId(image.id)}
                aria-pressed={isSelected}
                aria-label={image.alt_text || alt}
                className={`size-16 shrink-0 overflow-hidden rounded-lg transition-shadow sm:size-20 ${
                  isSelected
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : "ring-1 ring-border hover:ring-input"
                }`}
              >
                <ProductImageFrame image={image} alt="" className="size-full" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
