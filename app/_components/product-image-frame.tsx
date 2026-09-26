"use client";

import { useState } from "react";

import type { ProductImage } from "@/lib/catalog/types";

// Storefront image frame: a fixed-ratio, filled box the image covers (or is
// contained in), so every product occupies the same area whatever the
// source dimensions, with no layout shift while it loads. When there is no
// image, or the image fails to load, the frame shows a quiet placeholder
// glyph instead of the browser's broken-image icon and alt text. The <img>
// itself stays in the DOM (only faded out), so it remains discoverable to
// assistive tech via its alt text — this is presentation only.
export function ProductImageFrame({
  image,
  alt,
  fit = "cover",
  className = "",
  imgClassName = "",
}: {
  image: ProductImage | null;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
  imgClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = image !== null && failedSrc === image.url;
  const showPlaceholder = image === null || failed;

  return (
    <div className={`relative overflow-hidden bg-fill ${className}`}>
      {showPlaceholder && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-subtle/70"
        >
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5-11 11" />
        </svg>
      )}
      {image && (
        // S3_PUBLIC_BASE_URL is only known at runtime, so next/image's static
        // remotePatterns can't target it — a plain <img> is used instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          // alt="" marks a decorative use (e.g. a thumbnail whose button is
          // already labelled); otherwise prefer the image's own alt text.
          alt={alt === "" ? "" : image.alt_text || alt}
          // An image that already failed before hydration never fires
          // onError again; catch that case when the element mounts.
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setFailedSrc(image.url);
          }}
          onError={() => setFailedSrc(image.url)}
          className={`absolute inset-0 size-full text-transparent ${
            fit === "contain" ? "object-contain" : "object-cover"
          } ${failed ? "opacity-0" : ""} ${imgClassName}`}
        />
      )}
    </div>
  );
}
