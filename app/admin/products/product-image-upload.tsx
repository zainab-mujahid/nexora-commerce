"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import {
  confirmProductImageUpload,
  requestProductImageUploadUrl,
} from "@/lib/admin/product-images";
import {
  PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/admin/schemas";
import type { ProductImage } from "@/lib/catalog/types";

const ALLOWED_CONTENT_TYPES: readonly string[] = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES;
const ACCEPT = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES.join(",");
const MAX_SIZE_LABEL = `${Math.round(PRODUCT_IMAGE_MAX_SIZE_BYTES / (1024 * 1024))}MB`;

// Upload only (Step 10). Setting a primary image, editing alt text,
// reordering, deleting, and replacing are Step 11's job — this just gets an
// image from the admin's file picker into S3 and product_images.
export function ProductImageUpload({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file for another upload
    if (!file) return;

    setError(null);

    // Client-side checks are only a fast UX hint — requestProductImageUploadUrl
    // and confirmProductImageUpload enforce the real allow-list and size cap.
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WEBP, and GIF images are allowed.");
      return;
    }
    if (file.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
      setError(`File is too large. Maximum size is ${MAX_SIZE_LABEL}.`);
      return;
    }

    setPending(true);
    try {
      const presigned = await requestProductImageUploadUrl({
        productId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if ("error" in presigned) {
        setError(presigned.error);
        return;
      }

      const uploadResponse = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) {
        setError("Upload to S3 failed. Please try again.");
        return;
      }

      const confirmed = await confirmProductImageUpload({
        productId,
        key: presigned.key,
        contentType: file.type,
      });
      if ("error" in confirmed) {
        setError(confirmed.error);
        return;
      }

      router.refresh();
    } catch (uploadError) {
      console.error("ProductImageUpload: upload failed", uploadError);
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-3 rounded-md border border-black/15 p-4 dark:border-white/20">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-image" className="text-sm font-medium">
          Product images
        </label>
        <input
          id="product-image"
          type="file"
          accept={ACCEPT}
          disabled={pending}
          onChange={handleFileChange}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-background disabled:opacity-60"
        />
        <p className="text-xs text-foreground/60">
          JPEG, PNG, WEBP, or GIF, up to {MAX_SIZE_LABEL}. Add one at a time.
        </p>
      </div>

      {pending && <p className="text-sm text-foreground/60">Uploading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {images.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-foreground/70">
          {images.map((image) => (
            <li key={image.id}>
              {image.s3_key.split("/").pop()}
              {image.is_primary ? " (primary)" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
