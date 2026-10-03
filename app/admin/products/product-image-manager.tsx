"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { ProductImageFrame } from "@/app/_components/product-image-frame";
import {
  confirmProductImageReplace,
  deleteProductImage,
  moveProductImage,
  requestProductImageReplaceUploadUrl,
  setProductImagePrimary,
  updateProductImageAltText,
  type ProductImageActionResult,
} from "@/lib/admin/product-images";
import type { ProductImageStorage } from "@/lib/admin/product-image-storage";
import { PRODUCT_IMAGE_MAX_PER_PRODUCT } from "@/lib/admin/schemas";
import type { ProductImage } from "@/lib/catalog/types";

import { IMAGE_ACCEPT, IMAGE_MAX_SIZE_LABEL, putToS3, uploadProductImage, validateImageFile } from "./product-image-upload";

type UploadLine = { name: string; status: "waiting" | "uploading" | "done" | "failed"; error?: string };

// Full image management for one product — add (several at once), set
// primary, edit alt text, reorder, replace, delete. Rendered on the edit
// page; a new product uploads its first images from the create form.
export function ProductImageManager({
  productId,
  images,
  storage,
}: {
  productId: string;
  images: ProductImage[];
  // Server-side S3 check of the stored keys (lib/admin/product-image-storage.ts).
  storage: ProductImageStorage;
}) {
  const router = useRouter();
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [lines, setLines] = useState<UploadLine[]>([]);
  const remaining = Math.max(0, PRODUCT_IMAGE_MAX_PER_PRODUCT - images.length);

  async function handleAddFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-selecting the same files
    if (files.length === 0) return;

    setAddError(null);
    if (files.length > remaining) {
      setAddError(
        remaining === 0
          ? `This product already has ${PRODUCT_IMAGE_MAX_PER_PRODUCT} images. Delete one to add another.`
          : `You can add ${remaining} more image${remaining === 1 ? "" : "s"} to this product.`,
      );
      return;
    }

    setAddPending(true);
    setLines(files.map((file) => ({ name: file.name, status: "waiting" })));
    let anyDone = false;
    // One at a time: each file gets its own presigned URL and confirmation,
    // and a failure never affects the files that already went through.
    for (const [index, file] of files.entries()) {
      setLines((current) => current.map((line, i) => (i === index ? { ...line, status: "uploading" } : line)));
      let result: { imageId: string } | { error: string };
      try {
        result = await uploadProductImage(productId, file);
      } catch (error) {
        console.error("ProductImageManager: upload failed", error);
        result = { error: "Something went wrong. Please try again." };
      }
      if ("imageId" in result) anyDone = true;
      const outcome = result;
      setLines((current) =>
        current.map((line, i) =>
          i !== index ? line : "error" in outcome ? { ...line, status: "failed", error: outcome.error } : { ...line, status: "done" },
        ),
      );
    }
    setAddPending(false);
    if (anyDone) router.refresh();
  }

  const missingCount = images.filter((image) => storage.missingIds.includes(image.id)).length;

  return (
    <div className="card flex flex-col gap-5 p-5 sm:p-6">
      {!storage.reachable && (
        <p role="alert" className="rounded-md border border-warning/40 bg-fill/40 px-3 py-2 text-xs leading-relaxed">
          Image storage isn&apos;t reachable from this server{storage.problem ? ` (${storage.problem})` : ""}. Stored images
          can&apos;t be shown, uploaded or deleted until the S3 bucket and AWS credentials are fixed.
        </p>
      )}
      {storage.reachable && missingCount > 0 && (
        <p role="status" className="rounded-md border border-warning/40 bg-fill/40 px-3 py-2 text-xs leading-relaxed">
          {missingCount === 1 ? "1 image file is" : `${missingCount} image files are`} missing from storage. Customers see a
          placeholder instead — replace or delete {missingCount === 1 ? "it" : "them"} below.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="product-image" className="text-sm font-medium">
            Add images
          </label>
          <span className="text-xs text-muted tabular-nums">
            {images.length} of {PRODUCT_IMAGE_MAX_PER_PRODUCT}
          </span>
        </div>
        <input
          id="product-image"
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          disabled={addPending || remaining === 0}
          onChange={handleAddFiles}
          className="text-sm file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border-0 file:bg-foreground file:px-3 file:text-sm file:font-medium file:text-background disabled:opacity-60"
        />
        <p className="text-xs text-muted">
          JPEG, PNG, WEBP, or GIF, up to {IMAGE_MAX_SIZE_LABEL} each. Most products look best with 3–4 images.
        </p>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
        {lines.length > 0 && (
          <ul aria-live="polite" className="flex flex-col gap-1 text-xs">
            {lines.map((line, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="max-w-[16rem] truncate">{line.name}</span>
                <span
                  className={
                    line.status === "failed" ? "text-red-600 dark:text-red-400" : line.status === "done" ? "text-success" : "text-muted"
                  }
                >
                  {line.status === "waiting" ? "Waiting" : line.status === "uploading" ? "Uploading…" : line.status === "done" ? "Uploaded" : line.error}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {images.length === 0 ? (
        <p className="empty-state px-4 py-6 text-center text-sm text-muted">No images yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {images.map((image, index) => (
            <ProductImageRow
              key={image.id}
              image={image}
              missing={storage.missingIds.includes(image.id)}
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
  missing,
  isFirst,
  isLast,
  onChanged,
}: {
  image: ProductImage;
  missing: boolean;
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

    const clientError = validateImageFile(file);
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
    <li className="flex gap-4 rounded-md border border-border p-3">
      {/* Shared storefront frame: a failed image fades to a placeholder
          instead of the browser's broken-image icon (the <img> stays in the
          DOM). Display only — upload/ordering/deletion are unchanged. */}
      <ProductImageFrame
        image={image}
        alt={image.alt_text ?? ""}
        className="size-20 shrink-0 rounded-md ring-1 ring-inset ring-border"
      />

      <div className="flex flex-1 flex-col gap-2">
        <input
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          onBlur={handleAltTextBlur}
          disabled={busy}
          placeholder="Describe this image"
          aria-label="Image alt text"
          className="field h-8 min-h-8 px-2 py-1"
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {image.is_primary ? (
            <span className="badge badge-success">Primary</span>
          ) : (
            <button
              type="button"
              onClick={handleSetPrimary}
              disabled={busy}
              className="link-action"
            >
              Set as primary
            </button>
          )}
          <button
            type="button"
            onClick={() => handleMove("up")}
            disabled={busy || isFirst}
            className="link-action"
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => handleMove("down")}
            disabled={busy || isLast}
            className="link-action"
          >
            Move down
          </button>
          <label className="link-action">
            Replace
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={busy}
              onChange={handleReplace}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="link-action link-danger"
          >
            Delete
          </button>
        </div>

        {missing && (
          <p className="text-xs text-red-600 dark:text-red-400">
            File not found in storage — this record points at an object that no longer exists. Replace or delete it.
          </p>
        )}
        {pending && <p className="text-xs text-muted">Working…</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </li>
  );
}
