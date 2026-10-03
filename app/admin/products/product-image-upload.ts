import { confirmProductImageUpload, requestProductImageUploadUrl } from "@/lib/admin/product-images";
import { PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES, PRODUCT_IMAGE_MAX_SIZE_BYTES } from "@/lib/admin/schemas";

// Browser side of the existing upload flow, shared by the new-product form
// and the edit page's image manager: validate -> presigned URL (server
// action) -> direct PUT to S3 -> confirm (server action re-checks the object
// in S3 and records it). Client checks are UX hints only; the server actions
// enforce type, size, ownership and the per-product image limit.

const ALLOWED_CONTENT_TYPES: readonly string[] = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES;
export const IMAGE_ACCEPT = PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES.join(",");
export const IMAGE_MAX_SIZE_LABEL = `${Math.round(PRODUCT_IMAGE_MAX_SIZE_BYTES / (1024 * 1024))}MB`;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WEBP, and GIF images are allowed.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
    return `File is too large. Maximum size is ${IMAGE_MAX_SIZE_LABEL}.`;
  }
  return null;
}

export async function putToS3(uploadUrl: string, file: File): Promise<string | null> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    return response.ok ? null : "Upload to storage failed. Please try again.";
  } catch {
    // Network/CORS failure: the request never completed.
    return "Upload to storage failed. Check your connection and try again.";
  }
}

export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<{ imageId: string } | { error: string }> {
  const clientError = validateImageFile(file);
  if (clientError) return { error: clientError };

  const presigned = await requestProductImageUploadUrl({
    productId,
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if ("error" in presigned) return { error: presigned.error };

  const uploadError = await putToS3(presigned.uploadUrl, file);
  if (uploadError) return { error: uploadError };

  const confirmed = await confirmProductImageUpload({ productId, key: presigned.key, contentType: file.type });
  if ("error" in confirmed) return { error: confirmed.error };
  return { imageId: confirmed.imageId };
}
