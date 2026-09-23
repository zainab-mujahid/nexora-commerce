import { cache } from "react";

import { getUser, requireUser } from "@/lib/auth/dal";
import { attachImageUrls } from "@/lib/catalog/products";
import type { ProductImage } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";

export type WishlistItem = {
  id: string;
  // null when the product row exists but is no longer visible to this
  // customer's own SELECT — same RLS interaction documented on
  // CartItem["product"] in lib/cart/queries.ts: products_select_active_or_admin
  // (`is_active or is_admin()`) hides a product an admin deactivated after it
  // was wishlisted, including through this embed. Never null because the
  // product was deleted — product_id cascades on delete, removing the
  // wishlist_items row itself.
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    stock: number;
    is_active: boolean;
    images: ProductImage[];
  } | null;
  // Populated only when `product` is null: just enough for the customer to
  // recognize which line this is — the name (from
  // get_own_wishlist_unavailable_product_names(), which only ever returns
  // inactive products the caller's own wishlist references; see
  // supabase/schema.sql) and one display image (an ordinary product_images
  // read, never gated by is_active). null if that lookup fails or finds
  // nothing, in which case the page falls back to a generic label.
  unavailableProduct: { name: string; images: ProductImage[] } | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const WISHLIST_SELECT =
  "id, product_id, product:products(id, name, slug, price, stock, is_active, images:product_images(id, s3_key, alt_text, is_primary, sort_order))";

// Same shape as lib/cart/queries.ts's loadUnavailableProductLabels(), kept
// as its own copy so the cart module stays untouched. Best-effort
// throughout: any failure degrades to "no label" (the page's generic
// fallback) rather than breaking /wishlist.
async function loadUnavailableProductLabels(
  supabase: SupabaseServerClient,
  productIds: string[],
): Promise<Map<string, { name: string; images: ProductImage[] }>> {
  const labels = new Map<string, { name: string; images: ProductImage[] }>();
  if (productIds.length === 0) return labels;

  try {
    const [{ data: names, error: namesError }, { data: images, error: imagesError }] =
      await Promise.all([
        supabase.rpc("get_own_wishlist_unavailable_product_names"),
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
        "loadUnavailableProductLabels: get_own_wishlist_unavailable_product_names RPC failed",
        namesError,
      );
    }
    if (imagesError) {
      console.error("loadUnavailableProductLabels: failed to load product images", imagesError);
    }

    // Rows arrive ordered per product_id with the best image first (primary,
    // then lowest sort_order), so the first one seen per product is the one
    // display image — never the whole set.
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

    // Keyed off the RPC's rows, so a label (and its image) exists only for a
    // product the database itself confirmed is in this caller's wishlist
    // and inactive.
    for (const row of (names ?? []) as { product_id: string; name: string }[]) {
      const bestImage = bestImageByProduct.get(row.product_id);
      labels.set(row.product_id, {
        name: row.name,
        images: bestImage ? attachImageUrls([bestImage]) : [],
      });
    }
  } catch (err) {
    console.error("loadUnavailableProductLabels: unexpected failure", err);
  }

  return labels;
}

// RLS (wishlist_items_owner_only) already scopes every row to auth.uid(),
// but this explicit .eq is the same defense-in-depth the cart/catalog
// queries already apply on top of RLS elsewhere in this codebase.
export const getWishlistItems = cache(async (): Promise<WishlistItem[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(WISHLIST_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`getWishlistItems: failed to load wishlist for user "${user.id}"`, error);
    throw new Error("Failed to load wishlist");
  }

  // `product` types as an array for the same reason it does in
  // lib/cart/queries.ts and lib/catalog/products.ts: postgrest-js can't
  // prove a to-one embed's cardinality without generated Database types.
  // At runtime it's a single object — or null, per WishlistItem["product"].
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

// Used from the (public) product detail page to decide whether to show
// "Add to wishlist" or "Remove from wishlist" — unlike getWishlistItems,
// this must work for a signed-out visitor too, so it uses getUser() (which
// returns null) rather than requireUser() (which would redirect a guest
// away from a page they're allowed to view).
export const getWishlistItemForProduct = cache(
  async (productId: string): Promise<{ id: string } | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("wishlist_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      console.error(
        `getWishlistItemForProduct: failed to look up wishlist item for product "${productId}"`,
        error,
      );
      throw new Error("Failed to look up wishlist item");
    }

    return data;
  },
);
