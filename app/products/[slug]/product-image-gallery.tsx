"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { ActiveIndicator } from "@/app/_components/motion/active-indicator";
import { DURATION, EASE } from "@/app/_components/motion/tokens";

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

  const frame = "aspect-square w-full rounded-2xl ring-1 ring-inset ring-border";

  if (images.length === 0 || !initial) {
    return <ProductImageFrame image={null} alt={alt} className={`${frame} ${className}`} />;
  }

  const selected = images.find((image) => image.id === selectedId) ?? initial;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* The previous image fades out over the new one (both absolutely
          stacked in one frame), so switching thumbnails never flashes. */}
      <div className={`relative overflow-hidden bg-fill ${frame}`}>
        <AnimatePresence initial={false}>
          <m.div
            key={selected.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.015 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
          >
            <ProductImageFrame image={selected} alt={alt} fit="contain" className="size-full" />
          </m.div>
        </AnimatePresence>
      </div>

      {images.length > 1 && (
        // Tab reaches the thumbnails; Left/Right (and Home/End) move the
        // selection like a toolbar, Enter/Space select the focused one.
        <div
          role="group"
          aria-label="Product images"
          onKeyDown={(event) => {
            const index = images.findIndex((image) => image.id === selected.id);
            const target =
              event.key === "ArrowRight" ? Math.min(index + 1, images.length - 1)
              : event.key === "ArrowLeft" ? Math.max(index - 1, 0)
              : event.key === "Home" ? 0
              : event.key === "End" ? images.length - 1
              : -1;
            if (target < 0) return;
            event.preventDefault();
            setSelectedId(images[target].id);
            event.currentTarget.querySelectorAll("button")[target]?.focus();
          }}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
        >
          {images.map((image, index) => {
            const isSelected = image.id === selected.id;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedId(image.id)}
                aria-pressed={isSelected}
                aria-label={`${image.alt_text || alt} — image ${index + 1} of ${images.length}`}
                className={`relative size-16 shrink-0 rounded-lg p-0.5 transition-opacity sm:size-20 ${
                  isSelected ? "" : "opacity-75 hover:opacity-100"
                }`}
              >
                {isSelected && (
                  <ActiveIndicator layoutId="gallery-thumb" className="inset-0 rounded-[0.875rem] ring-2 ring-foreground" />
                )}
                <ProductImageFrame image={image} alt="" className="size-full rounded-[0.625rem] ring-1 ring-inset ring-border" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
