"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import {
  confirmProductImageReplace,
  confirmProductImageUpload,
  deleteProductImage,
  moveProductImage,
  requestProductImageReplaceUploadUrl,
  requestProductImageUploadUrl,
  setProductImagePrimary,
  updateProductImageAltText,
  type ProductImageActionResult,
} from "@/lib/admin/product-images";
import {
  PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/admin/schemas";
import type { ProductImage } from "@/lib/catalog/types";

const ALLOWED_CONTENT_TYPES: readonly string[] = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES;
const ACCEPT = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES.join(",");
const MAX_SIZE_LABEL = `${Math.round(PRODUCT_IMAGE_MAX_SIZE_BYTES / (1024 * 1024))}MB`;

function validateFile(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WEBP, and GIF images are allowed.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_SIZE_LABEL}.`;
  }
  return null;
}

async function putToS3(uploadUrl: string, file: File): Promise<string | null> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return response.ok ? null : "Upload to S3 failed. Please try again.";
}

// Step 11: full image management for one product — add, set primary, edit
// alt text, reorder, replace, delete. Rendered on the edit page only (a
// product id is required for the S3 key prefix).
export function ProductImageManager({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const router = useRouter();
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAddFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file for another upload
    if (!file) return;

    setAddError(null);
    const clientError = validateFile(file);
    if (clientError) {
      setAddError(clientError);
      return;
    }

    setAddPending(true);
    try {
      const presigned = await requestProductImageUploadUrl({
        productId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if ("error" in presigned) {
        setAddError(presigned.error);
        return;
      }

      const uploadError = await putToS3(presigned.uploadUrl, file);
      if (uploadError) {
        setAddError(uploadError);
        return;
      }

      const confirmed = await confirmProductImageUpload({
        productId,
        key: presigned.key,
        contentType: file.type,
      });
      if ("error" in confirmed) {
        setAddError(confirmed.error);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("ProductImageManager: add failed", error);
      setAddError("Something went wrong. Please try again.");
    } finally {
      setAddPending(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-md border border-black/15 p-4 dark:border-white/20">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-image" className="text-sm font-medium">
          Add image
        </label>
        <input
          id="product-image"
          type="file"
          accept={ACCEPT}
          disabled={addPending}
          onChange={handleAddFile}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-background disabled:opacity-60"
        />
        <p className="text-xs text-foreground/60">
          JPEG, PNG, WEBP, or GIF, up to {MAX_SIZE_LABEL}.
        </p>
        {addPending && <p className="text-sm text-foreground/60">Uploading…</p>}
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-foreground/60">No images yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {images.map((image, index) => (
            <ProductImageRow
              key={image.id}
              image={image}
              isFirst={index === 0}
              isLast={index === images.length - 1}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type PendingKind = "primary" | "move" | "delete" | "replace" | "alt";

function ProductImageRow({
  image,
  isFirst,
  isLast,
  onChanged,
}: {
  image: ProductImage;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const [altText, setAltText] = useState(image.alt_text ?? "");
  const [pending, setPending] = useState<PendingKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withPending(
    kind: PendingKind,
    run: () => Promise<ProductImageActionResult>,
  ) {
    setError(null);
    setPending(kind);
    try {
      const result = await run();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onChanged();
    } catch (runError) {
      console.error("ProductImageRow: action failed", runError);
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleSetPrimary() {
    await withPending("primary", () => setProductImagePrimary(image.id));
  }

  async function handleMove(direction: "up" | "down") {
    await withPending("move", () => moveProductImage(image.id, direction));
  }

  async function handleDelete() {
    if (!confirm("Delete this image? This cannot be undone.")) return;
    await withPending("delete", () => deleteProductImage(image.id));
  }

  async function handleAltTextBlur() {
    if (altText === (image.alt_text ?? "")) return;
    await withPending("alt", () => updateProductImageAltText(image.id, altText));
  }

  async function handleReplace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const clientError = validateFile(file);
    if (clientError) {
      setError(clientError);
      return;
    }

    setError(null);
    setPending("replace");
    try {
      const presigned = await requestProductImageReplaceUploadUrl({
        imageId: image.id,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if ("error" in presigned) {
        setError(presigned.error);
        return;
      }

      const uploadError = await putToS3(presigned.uploadUrl, file);
      if (uploadError) {
        setError(uploadError);
        return;
      }

      const confirmed = await confirmProductImageReplace({
        imageId: image.id,
        key: presigned.key,
        contentType: file.type,
      });
      if ("error" in confirmed) {
        setError(confirmed.error);
        return;
      }

      onChanged();
    } catch (replaceError) {
      console.error("ProductImageRow: replace failed", replaceError);
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <li className="flex gap-3 rounded-md border border-black/10 p-3 dark:border-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- S3_PUBLIC_BASE_URL
          is a runtime env value, not a static domain next/image can target. */}
      <img
        src={image.url}
        alt={image.alt_text ?? ""}
        className="h-20 w-20 shrink-0 rounded-md object-cover"
      />

      <div className="flex flex-1 flex-col gap-2">
        <input
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          onBlur={handleAltTextBlur}
          disabled={busy}
          placeholder="Alt text"
          className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/50 disabled:opacity-60 dark:border-white/20"
        />

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {image.is_primary ? (
            <span className="font-medium text-foreground">Primary</span>
          ) : (
            <button
              type="button"
              onClick={handleSetPrimary}
              disabled={busy}
              className="hover:opacity-70 disabled:opacity-60"
            >
              Set as primary
            </button>
          )}
          <button
            type="button"
            onClick={() => handleMove("up")}
            disabled={busy || isFirst}
            className="hover:opacity-70 disabled:opacity-40"
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => handleMove("down")}
            disabled={busy || isLast}
            className="hover:opacity-70 disabled:opacity-40"
          >
            Move down
          </button>
          <label className="cursor-pointer hover:opacity-70">
            Replace
            <input
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={handleReplace}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-red-600 hover:opacity-70 disabled:opacity-60"
          >
            Delete
          </button>
        </div>

        {pending && <p className="text-xs text-foreground/60">Working…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </li>
  );
}
