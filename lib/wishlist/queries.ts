import { cache } from "react";

import { getUser, requireUser } from "@/lib/auth/dal";
import { attachImageUrls } from "@/lib/catalog/products";
import type { ProductImage } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";

export type WishlistItem = {
  id: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    stock: number;
    is_active: boolean;
    images: ProductImage[];
  };
};

const WISHLIST_SELECT =
  "id, product:products(id, name, slug, price, stock, is_active, images:product_images(id, s3_key, alt_text, is_primary, sort_order))";

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
  return data.map((row) => {
    const product = row.product as unknown as {
      id: string;
      name: string;
      slug: string;
      price: string;
      stock: number;
      is_active: boolean;
      images: Omit<ProductImage, "url">[];
    };

    return {
      id: row.id,
      product: { ...product, images: attachImageUrls(product.images) },
    };
  });
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
