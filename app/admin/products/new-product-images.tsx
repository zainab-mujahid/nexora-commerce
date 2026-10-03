"use client";

import { useEffect, useRef, type ChangeEvent } from "react";

import { PRODUCT_IMAGE_MAX_PER_PRODUCT } from "@/lib/admin/schemas";

import { IMAGE_ACCEPT, IMAGE_MAX_SIZE_LABEL, validateImageFile } from "./product-image-upload";

// Image selection for a product that doesn't exist yet. Files stay in the
// browser (local previews only) until the product is saved; the form then
// uploads them through the normal S3 flow under the new product's id.
export type PickedImage = { id: string; file: File; previewUrl: string };

export function NewProductImages({
  images,
  primaryId,
  disabled,
  onChange,
  onPrimaryChange,
  error,
  onError,
}: {
  images: PickedImage[];
  primaryId: string | null;
  disabled: boolean;
  onChange: (images: PickedImage[]) => void;
  onPrimaryChange: (id: string) => void;
  error: string | null;
  onError: (message: string | null) => void;
}) {
  // Release the local preview URLs when the form goes away.
  const latest = useRef(images);
  useEffect(() => {
    latest.current = images;
  }, [images]);
  useEffect(() => () => latest.current.forEach((image) => URL.revokeObjectURL(image.previewUrl)), []);

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    onError(null);
    const room = PRODUCT_IMAGE_MAX_PER_PRODUCT - images.length;
    const accepted: PickedImage[] = [];
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) {
        onError(`${file.name}: ${problem}`);
        continue;
      }
      if (accepted.length >= room) {
        onError(`A product can have at most ${PRODUCT_IMAGE_MAX_PER_PRODUCT} images.`);
        break;
      }
      accepted.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    if (accepted.length === 0) return;
    const next = [...images, ...accepted];
    onChange(next);
    if (!primaryId) onPrimaryChange(next[0].id);
  }

  function remove(id: string) {
    const target = images.find((image) => image.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = images.filter((image) => image.id !== id);
    onChange(next);
    if (primaryId === id) onPrimaryChange(next[0]?.id ?? "");
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium">
        <span>Images</span>
        <span className="text-xs font-normal text-muted tabular-nums">
          {images.length} of {PRODUCT_IMAGE_MAX_PER_PRODUCT}
        </span>
      </legend>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => {
            const isPrimary = image.id === primaryId;
            return (
              <li key={image.id} className="flex flex-col gap-1.5">
                <div className={`relative aspect-square overflow-hidden rounded-lg bg-fill ring-1 ring-inset ${isPrimary ? "ring-2 ring-foreground" : "ring-border"}`}>
                  {/* Local preview (blob: URL) — nothing is uploaded until the product is saved. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  {isPrimary && <span className="badge badge-success absolute left-1.5 top-1.5">Primary</span>}
                </div>
                <span className="truncate text-xs text-muted" title={image.file.name}>
                  {image.file.name}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {!isPrimary && (
                    <button type="button" onClick={() => onPrimaryChange(image.id)} className="link-action">
                      Make primary
                    </button>
                  )}
                  <button type="button" onClick={() => remove(image.id)} className="link-action link-danger" aria-label={`Remove ${image.file.name}`}>
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {images.length < PRODUCT_IMAGE_MAX_PER_PRODUCT && (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-input px-4 py-5 text-center text-sm transition-colors hover:border-foreground/40">
          <span className="font-medium">{images.length === 0 ? "Choose images" : "Add more images"}</span>
          <span className="text-xs text-muted">
            JPEG, PNG, WEBP or GIF, up to {IMAGE_MAX_SIZE_LABEL} each · 3–4 images work best
          </span>
          <input type="file" accept={IMAGE_ACCEPT} multiple onChange={handlePick} className="sr-only" />
        </label>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-muted">Images upload when you save the product. You can reorder, replace or add more afterwards.</p>
    </fieldset>
  );
}
