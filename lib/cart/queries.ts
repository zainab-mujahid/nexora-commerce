import { cache } from "react";

import { attachImageUrls } from "@/lib/catalog/products";
import type { ProductImage } from "@/lib/catalog/types";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CartItem = {
  id: string;
  quantity: number;
  // null when the product row exists but is no longer visible to this
  // customer's own SELECT — in practice this means an admin deactivated it
  // after it was added to the cart (see products_select_active_or_admin in
  // supabase/schema.sql: `is_active or is_admin()`, so a non-admin's session
  // never sees an inactive product row, including through this embed). It is
  // never null because the product was deleted — product_id has an
  // on-delete-cascade FK to products, so the cart_items row itself is
  // removed in that case rather than orphaned.
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    stock: number;
    is_active: boolean;
    images: ProductImage[];
  } | null;
  // Populated only when `product` is null: a best-effort display label so
  // the customer can tell *which* line this is instead of a bare "no longer
  // available" — important once more than one cart line is affected. Name
  // comes from get_own_cart_product_names(), a narrowly scoped RPC that
  // only ever reveals the name of a product this customer's own cart_items
  // already references (see supabase/schema.sql for the justification);
  // images come from an ordinary product_images read, which was never
  // gated by the product's is_active in the first place.
  unavailableProduct: { name: string; images: ProductImage[] } | null;
};

export type CartSummary = {
  items: CartItem[];
  subtotal: number;
  itemCount: number;
};

const CART_SELECT =
  "id, quantity, product_id, product:products(id, name, slug, price, stock, is_active, images:product_images(id, s3_key, alt_text, is_primary, sort_order))";

async function loadUnavailableProductLabels(
  supabase: SupabaseServerClient,
  productIds: string[],
): Promise<Map<string, { name: string; images: ProductImage[] }>> {
  const labels = new Map<string, { name: string; images: ProductImage[] }>();
  if (productIds.length === 0) return labels;

  // Two independent, best-effort reads: a failure in either degrades to the
  // generic "unavailable" label (see the caller) rather than breaking the
  // cart page — nothing here affects what checkout actually validates.
  const [{ data: names, error: namesError }, { data: images, error: imagesError }] =
    await Promise.all([
      supabase.rpc("get_own_cart_product_names"),
      supabase
        .from("product_images")
        .select("product_id, id, s3_key, alt_text, is_primary, sort_order")
        .in("product_id", productIds)
        .order("product_id", { ascending: true })
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
    ]);

  if (namesError) {
    console.error(
      "loadUnavailableProductLabels: get_own_cart_product_names RPC failed",
      namesError,
    );
  }
  if (imagesError) {
    console.error("loadUnavailableProductLabels: failed to load product images", imagesError);
  }

  // Rows arrive ordered per product_id with the best image first (primary,
  // then lowest sort_order), so keeping only the first one seen per product
  // is enough to pick the same "display image" ProductImageDisplay would.
  const bestImageByProduct = new Map<string, Omit<ProductImage, "url">>();
  for (const image of images ?? []) {
    if (!bestImageByProduct.has(image.product_id)) {
      bestImageByProduct.set(image.product_id, {
        id: image.id,
        s3_key: image.s3_key,
        alt_text: image.alt_text,
        is_primary: image.is_primary,
        sort_order: image.sort_order,
      });
    }
  }

  for (const row of (names ?? []) as { product_id: string; name: string }[]) {
    const bestImage = bestImageByProduct.get(row.product_id);
    labels.set(row.product_id, {
      name: row.name,
      images: bestImage ? attachImageUrls([bestImage]) : [],
    });
  }

  return labels;
}

// RLS (cart_items_owner_only) already scopes every row to auth.uid(), but
// this explicit .eq is the same defense-in-depth the catalog queries
// already apply on top of RLS elsewhere in this codebase.
export const getCartItems = cache(async (): Promise<CartItem[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(CART_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`getCartItems: failed to load cart for user "${user.id}"`, error);
    throw new Error("Failed to load cart");
  }

  // `product` types as an array for the same reason category/images do
  // elsewhere in lib/catalog/products.ts: postgrest-js can't prove a to-one
  // embed's cardinality without generated Database types. At runtime it's a
  // single object — or null, per the CartItem["product"] comment above.
  const parsed = data.map((row) => {
    const product = row.product as unknown as {
      id: string;
      name: string;
      slug: string;
      price: string;
      stock: number;
      is_active: boolean;
      images: Omit<ProductImage, "url">[];
    } | null;

    return {
      id: row.id,
      productId: row.product_id as string,
      quantity: row.quantity,
      product: product ? { ...product, images: attachImageUrls(product.images) } : null,
    };
  });

  const missingProductIds = parsed
    .filter((item) => !item.product)
    .map((item) => item.productId);
  const unavailableLabels = await loadUnavailableProductLabels(supabase, missingProductIds);

  return parsed.map(({ productId, ...item }) => ({
    ...item,
    unavailableProduct: item.product ? null : (unavailableLabels.get(productId) ?? null),
  }));
});

export async function getCartSummary(): Promise<CartSummary> {
  const items = await getCartItems();
  // A null-product line (see CartItem["product"]) contributes no price —
  // it's unavailable and can't be purchased, never priced at 0.
  const subtotal = items.reduce(
    (sum, item) =>
      sum + (item.product ? Number(item.product.price) * item.quantity : 0),
    0,
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, subtotal, itemCount };
}
