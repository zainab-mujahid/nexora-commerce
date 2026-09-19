import { cache } from "react";

import { getS3PublicUrl } from "@/lib/s3/url";
import { createClient } from "@/lib/supabase/server";

import { getCategoryBySlug } from "./categories";
import type { Category, ProductDetail, ProductImage, ProductListItem } from "./types";

const LIST_SELECT =
  "id, name, slug, price, stock, images:product_images(id, s3_key, alt_text, is_primary, sort_order)";
const DETAIL_SELECT =
  "id, name, slug, price, stock, description, is_active, category:categories(id, name, slug, description), images:product_images(id, s3_key, alt_text, is_primary, sort_order)";

// product_images rows only ever store the S3 object key — the public URL is
// constructed here, at read time, from deployment configuration
// (S3_PUBLIC_BASE_URL), never persisted.
function attachImageUrls(
  images: Omit<ProductImage, "url">[],
): ProductImage[] {
  return images.map((image) => ({ ...image, url: getS3PublicUrl(image.s3_key) }));
}

// The public product list/detail views apply their own is_active filter on
// top of RLS rather than relying on it alone: RLS's `is_active or is_admin()`
// is a security backstop (it also lets an admin's own session see inactive
// rows), but a customer-facing listing must never show inactive products
// regardless of who happens to be viewing it.
//
// A genuine query failure is thrown, not swallowed: these are called from
// Server Components (Step 6 pages), and throwing lets the nearest error.tsx
// boundary render a real error state, distinct from a legitimate "no
// products" / "not found" result, which is never an error.
export const getActiveProducts = cache(
  async (options?: { limit?: number }): Promise<ProductListItem[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("products")
      .select(LIST_SELECT)
      .eq("is_active", true)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getActiveProducts: failed to load products", error);
      throw new Error("Failed to load products");
    }

    return data.map((product) => ({
      ...product,
      images: attachImageUrls(product.images),
    }));
  },
);

// No is_active filter here: RLS alone decides visibility, so a direct link
// to a deactivated product still resolves for an admin's own session (e.g.
// previewing a draft) while correctly returning null (-> notFound()) for
// everyone else.
export const getProductBySlug = cache(
  async (slug: string): Promise<ProductDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(DETAIL_SELECT)
      .eq("slug", slug)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .maybeSingle();

    if (error) {
      console.error(`getProductBySlug: failed to load product "${slug}"`, error);
      throw new Error("Failed to load product");
    }

    if (!data) return null;

    // TypeScript types `category` as an array — postgrest-js can only prove
    // a to-one embed's cardinality from generated Database types, which this
    // project doesn't have, so it defaults the type to an array. That's a
    // type-inference limitation only: at runtime PostgREST returns a to-one
    // embed (products.category_id -> categories.id) as a plain object or
    // null, never an array, so the value must be used as-is, not indexed.
    const { category, images, ...rest } = data;
    return {
      ...rest,
      images: attachImageUrls(images),
      category: category as unknown as Category | null,
    };
  },
);

// ---- Admin reads (Step 8) ----
// No is_active filter: an admin managing the catalog must see inactive/draft
// products too. RLS's is_admin() check is what makes this safe — a
// non-admin session querying the same way would only ever get active rows
// back, same as the customer-facing functions above.

export const getAdminProducts = cache(async (): Promise<ProductDetail[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(DETAIL_SELECT)
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { referencedTable: "images" })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAdminProducts: failed to load products", error);
    throw new Error("Failed to load products");
  }

  // See the comment in getProductBySlug above: category is a plain object
  // or null at runtime (a to-one embed), not an array — only the inferred
  // TypeScript type says otherwise.
  return data.map(({ category, images, ...rest }) => ({
    ...rest,
    images: attachImageUrls(images),
    category: category as unknown as Category | null,
  }));
});

export const getAdminProductById = cache(
  async (id: string): Promise<ProductDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(DETAIL_SELECT)
      .eq("id", id)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .maybeSingle();

    if (error) {
      console.error(`getAdminProductById: failed to load product "${id}"`, error);
      throw new Error("Failed to load product");
    }

    if (!data) return null;

    // See the comment in getProductBySlug above: category is a plain object
    // or null at runtime (a to-one embed), not an array — only the inferred
    // TypeScript type says otherwise.
    const { category, images, ...rest } = data;
    return {
      ...rest,
      images: attachImageUrls(images),
      category: category as unknown as Category | null,
    };
  },
);

export type ProductsByCategory = {
  category: Category;
  products: ProductListItem[];
};

// Returns null only when the category itself doesn't exist (-> notFound());
// a products-query failure for an existing category throws instead, so a
// real error is never rendered as an empty/"not found" category.
export const getProductsByCategory = cache(
  async (
    categorySlug: string,
    options?: { limit?: number },
  ): Promise<ProductsByCategory | null> => {
    const category = await getCategoryBySlug(categorySlug);
    if (!category) return null;

    const supabase = await createClient();
    let query = supabase
      .from("products")
      .select(LIST_SELECT)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .order("sort_order", { referencedTable: "images" })
      .order("created_at", { referencedTable: "images" })
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `getProductsByCategory: failed to load products for category "${categorySlug}"`,
        error,
      );
      throw new Error("Failed to load products for this category");
    }

    return {
      category,
      products: data.map((product) => ({
        ...product,
        images: attachImageUrls(product.images),
      })),
    };
  },
);
