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
// (lib/catalog/products.ts), which is what this renders the thumbnails in.
// The main image is contained (not cropped) in its frame so the whole
// product stays visible whatever the source aspect ratio. The frame is 4:5
// rather than square: at the same width it is never smaller for any image,
// and portrait product shots (the common case) fill far more of it.
//
// Layout: below lg the thumbnails are a horizontal, touch-scrollable strip
// under the main image; from lg they become a vertical rail on its left,
// as tall as the main image and scrolling within itself when there are
// many. DOM order (main image, then thumbnails) is the same at every size.
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

  const frame = "aspect-[4/5] w-full rounded-2xl ring-1 ring-inset ring-border";
  // Without a rail (one image, or none) the frame would take the whole
  // wider lg column; cap it at about the size it has beside the rail.
  const soloCap = "lg:max-w-[30rem]";

  if (images.length === 0 || !initial) {
    return (
      <div className={className}>
        <ProductImageFrame image={null} alt={alt} className={`${frame} ${soloCap}`} />
      </div>
    );
  }

  const selected = images.find((image) => image.id === selectedId) ?? initial;
  const hasThumbnails = images.length > 1;

  return (
    <div
      className={`flex flex-col gap-3 ${
        hasThumbnails ? "lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-4" : ""
      } ${className}`}
    >
      {/* The previous image fades out over the new one (both absolutely
          stacked in one frame), so switching thumbnails never flashes. */}
      <div className={`relative overflow-hidden bg-media ${frame} ${hasThumbnails ? "lg:col-start-2 lg:row-start-1" : soloCap}`}>
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

      {hasThumbnails && (
        // From lg the rail's own box takes the grid row's height (set by the
        // main image) and the list inside is pinned to it, so a long set of
        // thumbnails scrolls inside the rail instead of stretching the row.
        <div className="relative lg:col-start-1 lg:row-start-1">
          {/* Tab reaches the thumbnails; Left/Right/Up/Down (and Home/End)
              move the selection like a toolbar, Enter/Space select the
              focused one. */}
          <div
            role="group"
            aria-label="Product images"
            onKeyDown={(event) => {
              const index = images.findIndex((image) => image.id === selected.id);
              const target =
                event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(index + 1, images.length - 1)
                : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(index - 1, 0)
                : event.key === "Home" ? 0
                : event.key === "End" ? images.length - 1
                : -1;
              if (target < 0) return;
              event.preventDefault();
              setSelectedId(images[target].id);
              event.currentTarget.querySelectorAll("button")[target]?.focus();
            }}
            className="-mx-1 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-1 py-1 lg:absolute lg:inset-0 lg:mx-0 lg:snap-y lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:px-1 lg:[scrollbar-width:thin]"
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
                  className={`relative aspect-[4/5] w-16 shrink-0 snap-start rounded-lg p-0.5 transition-opacity sm:w-20 lg:w-full ${
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
        </div>
      )}
    </div>
  );
}
