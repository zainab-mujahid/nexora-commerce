import { createClient } from "@/lib/supabase/server";

import { getCategoryBySlug } from "./categories";
import type { Category, ProductDetail, ProductListItem } from "./types";

const LIST_SELECT =
  "id, name, slug, price, stock, images:product_images(id, s3_key, alt_text, is_primary, sort_order)";
const DETAIL_SELECT =
  "id, name, slug, price, stock, description, is_active, category:categories(id, name, slug, description), images:product_images(id, s3_key, alt_text, is_primary, sort_order)";

// The public product list/detail views apply their own is_active filter on
// top of RLS rather than relying on it alone: RLS's `is_active or is_admin()`
// is a security backstop (it also lets an admin's own session see inactive
// rows), but a customer-facing listing must never show inactive products
// regardless of who happens to be viewing it.
export async function getActiveProducts(options?: {
  limit?: number;
}): Promise<ProductListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(LIST_SELECT)
    .eq("is_active", true)
    .order("sort_order", { referencedTable: "images" })
    .order("created_at", { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getActiveProducts: failed to load products", error);
    return [];
  }

  return data;
}

// No is_active filter here: RLS alone decides visibility, so a direct link
// to a deactivated product still resolves for an admin's own session (e.g.
// previewing a draft) while correctly 404-ing (null) for everyone else.
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(DETAIL_SELECT)
    .eq("slug", slug)
    .order("sort_order", { referencedTable: "images" })
    .maybeSingle();

  if (error) {
    console.error(`getProductBySlug: failed to load product "${slug}"`, error);
    return null;
  }

  if (!data) return null;

  // category comes back as an array — postgrest-js can't infer to-one vs
  // to-many cardinality from a bare select string without generated
  // Database types, so it defaults to an array even for this many-to-one
  // relationship (products.category_id -> categories.id). Normalize it here
  // so callers get the accurate Category | null shape.
  const { category, ...rest } = data;
  return { ...rest, category: category[0] ?? null };
}

export type ProductsByCategory = {
  category: Category;
  products: ProductListItem[];
};

// Returns null only when the category itself doesn't exist — a products
// query failure for an existing category returns an empty list instead, so
// the two failure modes are never conflated into the same "not found" signal.
export async function getProductsByCategory(
  categorySlug: string,
  options?: { limit?: number },
): Promise<ProductsByCategory | null> {
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return null;

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(LIST_SELECT)
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("sort_order", { referencedTable: "images" })
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
    return { category, products: [] };
  }

  return { category, products: data };
}
