import { cache } from "react";

import { attachImageUrls } from "@/lib/catalog/products";
import type { ProductImage } from "@/lib/catalog/types";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CartItem = {
  id: string;
  quantity: number;
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

export type CartSummary = {
  items: CartItem[];
  subtotal: number;
  itemCount: number;
};

const CART_SELECT =
  "id, quantity, product:products(id, name, slug, price, stock, is_active, images:product_images(id, s3_key, alt_text, is_primary, sort_order))";

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
  // single object (cart_items.product_id -> products.id).
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
      quantity: row.quantity,
      product: { ...product, images: attachImageUrls(product.images) },
    };
  });
});

export async function getCartSummary(): Promise<CartSummary> {
  const items = await getCartItems();
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, subtotal, itemCount };
}
