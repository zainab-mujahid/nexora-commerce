import * as z from "zod";

// Matches the slug format the schema/URLs expect throughout the storefront
// (lowercase, numbers, single hyphens between words).
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugField = z
  .string()
  .trim()
  .min(2, { error: "Slug must be at least 2 characters long." })
  .max(200, { error: "Slug must be 200 characters or fewer." })
  .regex(SLUG_REGEX, {
    error: "Use lowercase letters, numbers, and single hyphens only (e.g. wireless-mouse).",
  });

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be 100 characters or fewer." }),
  slug: slugField,
  description: z
    .string()
    .trim()
    .max(500, { error: "Description must be 500 characters or fewer." })
    .optional()
    .or(z.literal("")),
});

export type CategoryFormState =
  | {
      errors?: {
        name?: string[];
        slug?: string[];
        description?: string[];
      };
      message?: string;
    }
  | undefined;

// Step 23E: z.coerce.number() turns "" and null into 0 (Number("") === 0),
// so a blank or missing price/stock field used to pass validation as zero —
// clearing the price while editing silently made a product free. Blank and
// missing values become undefined first, which coerces to NaN and fails with
// the field's normal "Enter a valid …" message. An explicit 0 / "0" is
// untouched and still valid (zero price/stock remain allowed by design).
function blankToUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(200, { error: "Name must be 200 characters or fewer." }),
  slug: slugField,
  description: z
    .string()
    .trim()
    .max(2000, { error: "Description must be 2000 characters or fewer." })
    .optional()
    .or(z.literal("")),
  price: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "Enter a valid price." })
      .min(0, { error: "Price must be zero or more." }),
  ),
  stock: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "Enter a valid stock quantity." })
      .int({ error: "Stock must be a whole number." })
      .min(0, { error: "Stock must be zero or more." }),
  ),
  categoryId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((value) => value || null),
});

export type ProductFormState =
  | {
      errors?: {
        name?: string[];
        slug?: string[];
        description?: string[];
        price?: string[];
        stock?: string[];
        categoryId?: string[];
      };
      message?: string;
    }
  | undefined;

// ---- Product image upload (Step 10) ----
// Shared between the client upload component (pre-flight UX hints only) and
// the server actions (the actual enforcement) — the client-side use is never
// a substitute for the server-side check.
export const PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const requestProductImageUploadSchema = z.object({
  productId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(PRODUCT_IMAGE_MAX_SIZE_BYTES),
});

export const confirmProductImageUploadSchema = z.object({
  productId: z.uuid(),
  key: z.string().trim().min(1).max(1024),
  contentType: z.enum(PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES),
});

// ---- Product image management (Step 11) ----
export const productImageIdSchema = z.object({
  imageId: z.uuid(),
});

export const updateProductImageAltTextSchema = z.object({
  imageId: z.uuid(),
  altText: z
    .string()
    .trim()
    .max(300, { error: "Alt text must be 300 characters or fewer." })
    .optional()
    .or(z.literal("")),
});

export const moveProductImageSchema = z.object({
  imageId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const requestProductImageReplaceUploadSchema = z.object({
  imageId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(PRODUCT_IMAGE_MAX_SIZE_BYTES),
});

export const confirmProductImageReplaceSchema = z.object({
  imageId: z.uuid(),
  key: z.string().trim().min(1).max(1024),
  contentType: z.enum(PRODUCT_IMAGE_ALLOWED_CONTENT_TYPES),
});

// ---- Order management (Step 18) ----
// 'cancelled' is deliberately excluded here — it's only ever reached through
// cancelOrder()'s dedicated RPC (which also restores stock), never through
// this plain status update. See lib/admin/orders.ts.
export const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered"] as const;

export const updateOrderStatusSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
});

export const cancelOrderSchema = z.object({
  orderId: z.uuid(),
});
