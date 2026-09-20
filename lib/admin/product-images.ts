"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { deleteS3Object } from "@/lib/s3/delete";
import { headS3Object } from "@/lib/s3/head";
import { createPresignedUploadUrl } from "@/lib/s3/presign";
import { createClient } from "@/lib/supabase/server";

import {
  confirmProductImageReplaceSchema,
  confirmProductImageUploadSchema,
  moveProductImageSchema,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
  productImageIdSchema,
  requestProductImageReplaceUploadSchema,
  requestProductImageUploadSchema,
  updateProductImageAltTextSchema,
} from "./schemas";

// Strips any path portion the browser may include and collapses everything
// outside a conservative safe set, so the value is safe to use verbatim as
// the tail of an S3 key.
function toSafeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "image";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned.slice(-150) || "image";
}

// Best-effort cleanup for an object that was already uploaded (a presigned
// PUT can't cap the request body size up front) but then rejected here — a
// failure to delete it just means one orphaned object, not a broken upload,
// so this logs and swallows rather than turning a validation error into a
// storage error.
async function deleteRejectedUpload(key: string): Promise<void> {
  try {
    await deleteS3Object(key);
  } catch (deleteError) {
    console.error(`deleteRejectedUpload: failed to delete oversized upload "${key}"`, deleteError);
  }
}

type OrderedProductImage = { id: string; sort_order: number };

// Ensures a product's images have distinct, sequential sort_order values
// (0, 1, 2, ...) and returns them in that order. Previously, uploaded
// images never had sort_order set on insert, so every row silently took the
// column default of 0 — this both assigns new uploads their real next
// position and, since it's called before every read that depends on order,
// self-heals any pre-existing rows that are still stuck at 0 the next time
// that product's images are touched (uploaded to, or reordered). There is
// no separate migration step: the fix lives entirely on this read path.
async function normalizeProductImageOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
): Promise<OrderedProductImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, sort_order, created_at")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(
      `normalizeProductImageOrder: failed to load images for product "${productId}"`,
      error,
    );
    throw new Error("Failed to load product images");
  }

  const isAlreadySequential = data.every(
    (image, index) => image.sort_order === index,
  );
  if (isAlreadySequential) {
    return data.map(({ id, sort_order }) => ({ id, sort_order }));
  }

  const results = await Promise.all(
    data.map((image, index) =>
      supabase
        .from("product_images")
        .update({ sort_order: index })
        .eq("id", image.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error(
      `normalizeProductImageOrder: failed to renumber images for product "${productId}"`,
      failed.error,
    );
    throw new Error("Failed to normalize product image order");
  }

  return data.map((image, index) => ({ id: image.id, sort_order: index }));
}

export type RequestProductImageUploadResult =
  | { uploadUrl: string; key: string }
  | { error: string };

// Step 10: generates a short-lived presigned PUT URL for a single product
// image. Only shapes the key and hands back a URL — the browser performs
// the actual upload directly to S3 (see confirmProductImageUpload below for
// what happens after).
export async function requestProductImageUploadUrl(
  input: unknown,
): Promise<RequestProductImageUploadResult> {
  // Server Actions are reachable by direct POST, not only through the admin
  // UI, so admin status is re-verified here regardless of what the page (or
  // app/admin/layout.tsx) already checked.
  await requireAdmin();

  const parsed = requestProductImageUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        "Invalid file. Only JPEG, PNG, WEBP, and GIF images up to 5MB are allowed.",
    };
  }

  const { productId, filename, contentType } = parsed.data;

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    console.error(
      `requestProductImageUploadUrl: failed to look up product "${productId}"`,
      productError,
    );
    return { error: "Something went wrong. Please try again." };
  }
  if (!product) {
    return { error: "Product not found." };
  }

  const key = `products/${productId}/${randomUUID()}-${toSafeFilename(filename)}`;
  const uploadUrl = await createPresignedUploadUrl(key, contentType);

  return { uploadUrl, key };
}

export type ConfirmProductImageUploadResult =
  | { success: true }
  | { error: string };

// Step 10: called once the browser's direct-to-S3 PUT succeeds. Re-verifies
// the object against S3 itself (never the browser's self-reported size/type)
// before recording it, then inserts the product_images metadata row.
export async function confirmProductImageUpload(
  input: unknown,
): Promise<ConfirmProductImageUploadResult> {
  await requireAdmin();

  const parsed = confirmProductImageUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid upload confirmation." };
  }

  const { productId, key, contentType } = parsed.data;

  // The key must be the one requestProductImageUploadUrl generated for this
  // exact product — a well-formed request can still name a mismatched
  // product/key pair, so this is checked explicitly rather than trusted.
  if (!key.startsWith(`products/${productId}/`)) {
    return { error: "This upload does not belong to the specified product." };
  }

  const metadata = await headS3Object(key);
  if (!metadata) {
    return { error: "Upload not found in S3. Please try uploading again." };
  }
  if (
    metadata.contentLength !== undefined &&
    metadata.contentLength > PRODUCT_IMAGE_MAX_SIZE_BYTES
  ) {
    // A presigned PUT can't cap the uploaded size up front, so the oversized
    // object already landed in S3 before this check ran — reject it without
    // recording it, but also remove it, or a rejected upload would still
    // cost storage indefinitely.
    await deleteRejectedUpload(key);
    return { error: "Uploaded file exceeds the 5MB size limit." };
  }

  const supabase = await createClient();

  // Normalizing first (self-heals any pre-existing rows still stuck at the
  // sort_order=0 default) also gives the exact next position: the
  // normalized list is 0..n-1, so a product with images at 0, 1, 2 gets its
  // new image at 3.
  const existingImages = await normalizeProductImageOrder(supabase, productId);
  const nextSortOrder = existingImages.length;

  const { error } = await supabase.from("product_images").insert({
    product_id: productId,
    s3_key: key,
    content_type: metadata.contentType ?? contentType,
    size_bytes: metadata.contentLength ?? null,
    sort_order: nextSortOrder,
  });

  if (error) {
    console.error(
      `confirmProductImageUpload: failed to insert product_images row for product "${productId}"`,
      error,
    );
    return {
      error: "Upload succeeded, but saving the image record failed. Please try again.",
    };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ---- Step 11: management ----

type ProductImageRow = {
  id: string;
  product_id: string;
  s3_key: string;
};

// Not-found is a legitimate outcome (stale UI, already-deleted image) and
// returns null; a genuine query failure throws, matching the read/throw
// convention lib/catalog/products.ts already uses.
async function getProductImageRow(imageId: string): Promise<ProductImageRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("id, product_id, s3_key")
    .eq("id", imageId)
    .maybeSingle();

  if (error) {
    console.error(`getProductImageRow: failed to look up image "${imageId}"`, error);
    throw new Error("Failed to look up product image");
  }

  return data;
}

export type ProductImageActionResult = { success: true } | { error: string };

// Sets one image as the product's primary image, unsetting any previous
// primary first — product_images has a partial unique index allowing at
// most one is_primary=true row per product, so clearing before setting
// avoids ever asking Postgres for two primaries at once.
export async function setProductImagePrimary(
  imageId: string,
): Promise<ProductImageActionResult> {
  await requireAdmin();

  const parsed = productImageIdSchema.safeParse({ imageId });
  if (!parsed.success) return { error: "Invalid image." };

  const image = await getProductImageRow(parsed.data.imageId);
  if (!image) return { error: "Image not found." };

  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", image.product_id)
    .eq("is_primary", true);

  if (clearError) {
    console.error(
      `setProductImagePrimary: failed to clear existing primary for product "${image.product_id}"`,
      clearError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  const { error: setError } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", image.id);

  if (setError) {
    console.error(`setProductImagePrimary: failed to set image "${image.id}" as primary`, setError);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateProductImageAltText(
  imageId: string,
  altText: string,
): Promise<ProductImageActionResult> {
  await requireAdmin();

  const parsed = updateProductImageAltTextSchema.safeParse({ imageId, altText });
  if (!parsed.success) {
    return { error: "Alt text must be 300 characters or fewer." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_images")
    .update({ alt_text: parsed.data.altText || null })
    .eq("id", parsed.data.imageId);

  if (error) {
    console.error(`updateProductImageAltText: failed to update image "${imageId}"`, error);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// Swaps sort_order with the adjacent sibling in the requested direction.
// A no-op (still a success) when already first/last.
export async function moveProductImage(
  imageId: string,
  direction: "up" | "down",
): Promise<ProductImageActionResult> {
  await requireAdmin();

  const parsed = moveProductImageSchema.safeParse({ imageId, direction });
  if (!parsed.success) return { error: "Invalid request." };

  const image = await getProductImageRow(parsed.data.imageId);
  if (!image) return { error: "Image not found." };

  const supabase = await createClient();

  // Normalizing first guarantees distinct, sequential sort_order values to
  // swap between — without this, legacy rows that are all still stuck at 0
  // (the pre-fix upload default) would "swap" 0 for 0 and appear to do
  // nothing, which is exactly the bug being fixed here.
  const siblings = await normalizeProductImageOrder(supabase, image.product_id);

  const index = siblings.findIndex((sibling) => sibling.id === image.id);
  const neighborIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
  const neighbor = siblings[neighborIndex];
  if (index === -1 || !neighbor) {
    return { success: true };
  }

  const current = siblings[index];
  const { error: firstError } = await supabase
    .from("product_images")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);

  if (firstError) {
    console.error(
      `moveProductImage: failed to update sort_order for image "${current.id}"`,
      firstError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  const { error: secondError } = await supabase
    .from("product_images")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);

  if (secondError) {
    console.error(
      `moveProductImage: failed to update sort_order for image "${neighbor.id}"`,
      secondError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// Deletes the S3 object first; the product_images row is only removed once
// that succeeds (per the plan). If S3 deletion fails, the row is left in
// place pointing at the still-existing object — safe to retry. The
// alternative failure mode (S3 object gone, row still there) is possible
// only if the row delete itself fails after a successful S3 delete, which
// is comparatively unlikely and, on retry, is a harmless no-op against S3
// (DeleteObject is idempotent on an already-missing key).
export async function deleteProductImage(imageId: string): Promise<ProductImageActionResult> {
  await requireAdmin();

  const parsed = productImageIdSchema.safeParse({ imageId });
  if (!parsed.success) return { error: "Invalid image." };

  const image = await getProductImageRow(parsed.data.imageId);
  if (!image) return { error: "Image not found." };

  try {
    await deleteS3Object(image.s3_key);
  } catch (deleteError) {
    console.error(`deleteProductImage: failed to delete S3 object "${image.s3_key}"`, deleteError);
    return { error: "Failed to delete the image from storage. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", image.id);

  if (error) {
    console.error(`deleteProductImage: failed to delete product_images row "${image.id}"`, error);
    return {
      error:
        "The image was removed from storage, but its database record could not be deleted. Please try again.",
    };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export type RequestProductImageReplaceResult =
  | { uploadUrl: string; key: string }
  | { error: string };

// Step 11 replace, part 1: presigns an upload for a NEW object under the
// same product prefix as the image being replaced. imageId (not productId)
// is the input — the product is derived server-side from the existing row,
// so a caller can't pair an upload with a product it doesn't belong to.
export async function requestProductImageReplaceUploadUrl(
  input: unknown,
): Promise<RequestProductImageReplaceResult> {
  await requireAdmin();

  const parsed = requestProductImageReplaceUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        "Invalid file. Only JPEG, PNG, WEBP, and GIF images up to 5MB are allowed.",
    };
  }

  const image = await getProductImageRow(parsed.data.imageId);
  if (!image) return { error: "Image not found." };

  const key = `products/${image.product_id}/${randomUUID()}-${toSafeFilename(parsed.data.filename)}`;
  const uploadUrl = await createPresignedUploadUrl(key, parsed.data.contentType);

  return { uploadUrl, key };
}

// Step 11 replace, part 2: called once the new object is uploaded. Updates
// the existing row to point at the new object (keeping its id, alt_text,
// is_primary, sort_order), then best-effort deletes the old object. Update
// happens before the old-object delete — the reverse order risks leaving
// the row pointing at nothing if the update failed after the old object was
// already gone, which would show as a broken image; an orphaned old object
// after a successful update only costs storage.
export async function confirmProductImageReplace(
  input: unknown,
): Promise<ProductImageActionResult> {
  await requireAdmin();

  const parsed = confirmProductImageReplaceSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid upload confirmation." };

  const { imageId, key, contentType } = parsed.data;

  const image = await getProductImageRow(imageId);
  if (!image) return { error: "Image not found." };

  if (!key.startsWith(`products/${image.product_id}/`)) {
    return { error: "This upload does not belong to the specified image." };
  }

  const metadata = await headS3Object(key);
  if (!metadata) {
    return { error: "Upload not found in S3. Please try uploading again." };
  }
  if (
    metadata.contentLength !== undefined &&
    metadata.contentLength > PRODUCT_IMAGE_MAX_SIZE_BYTES
  ) {
    await deleteRejectedUpload(key);
    return { error: "Uploaded file exceeds the 5MB size limit." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("product_images")
    .update({
      s3_key: key,
      content_type: metadata.contentType ?? contentType,
      size_bytes: metadata.contentLength ?? null,
    })
    .eq("id", image.id);

  if (updateError) {
    console.error(`confirmProductImageReplace: failed to update image "${image.id}"`, updateError);
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await deleteS3Object(image.s3_key);
  } catch (deleteError) {
    console.error(
      `confirmProductImageReplace: failed to delete old S3 object "${image.s3_key}"`,
      deleteError,
    );
  }

  revalidatePath("/", "layout");
  return { success: true };
}
