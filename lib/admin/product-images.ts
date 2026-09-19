"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { headS3Object } from "@/lib/s3/head";
import { createPresignedUploadUrl } from "@/lib/s3/presign";
import { createClient } from "@/lib/supabase/server";

import {
  confirmProductImageUploadSchema,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
  requestProductImageUploadSchema,
} from "./schemas";

// Strips any path portion the browser may include and collapses everything
// outside a conservative safe set, so the value is safe to use verbatim as
// the tail of an S3 key.
function toSafeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "image";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned.slice(-150) || "image";
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
    return { error: "Uploaded file exceeds the 5MB size limit." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_images").insert({
    product_id: productId,
    s3_key: key,
    content_type: metadata.contentType ?? contentType,
    size_bytes: metadata.contentLength ?? null,
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
