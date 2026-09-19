"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import {
  addToWishlistSchema,
  wishlistItemIdSchema,
  type WishlistActionState,
} from "./schemas";

export async function addToWishlist(productId: string): Promise<WishlistActionState> {
  // Server Actions are reachable by direct POST, not only through the
  // rendered form, so the session must be re-verified here.
  const user = await requireUser();

  const parsed = addToWishlistSchema.safeParse({ productId });
  if (!parsed.success) return { error: "Invalid product." };

  const supabase = await createClient();

  // wishlist_items has unique(user_id, product_id) — an upsert that ignores
  // the duplicate treats re-adding an already-wishlisted product as a
  // harmless no-op rather than a constraint-violation error.
  const { error } = await supabase.from("wishlist_items").upsert(
    { user_id: user.id, product_id: parsed.data.productId },
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error(
      `addToWishlist: failed to add product "${parsed.data.productId}" for user "${user.id}"`,
      error,
    );
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/wishlist");
  revalidatePath("/products/[slug]", "page");
  return { success: true };
}

export async function removeWishlistItem(wishlistItemId: string): Promise<void> {
  const user = await requireUser();

  const parsed = wishlistItemIdSchema.safeParse({ wishlistItemId });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("id", parsed.data.wishlistItemId)
    .eq("user_id", user.id);

  if (error) {
    console.error(`removeWishlistItem: failed to remove wishlist item "${wishlistItemId}"`, error);
    throw new Error("Failed to remove wishlist item");
  }

  revalidatePath("/wishlist");
  revalidatePath("/products/[slug]", "page");
}

// Adds the product to the cart — same stock-clamping and
// add-to-existing-quantity rules as lib/cart/actions.ts's addToCart, kept
// as its own small copy here rather than importing that "use server" file,
// so this module doesn't expose cart internals as extra server-action
// endpoints — and removes it from the wishlist once the cart write
// succeeds. "Move" means it no longer sits in both places afterward.
export async function moveWishlistItemToCart(
  wishlistItemId: string,
): Promise<WishlistActionState> {
  const user = await requireUser();

  const parsed = wishlistItemIdSchema.safeParse({ wishlistItemId });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { data: wishlistItem, error: wishlistError } = await supabase
    .from("wishlist_items")
    .select("id, product_id")
    .eq("id", parsed.data.wishlistItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (wishlistError) {
    console.error(
      `moveWishlistItemToCart: failed to look up wishlist item "${wishlistItemId}"`,
      wishlistError,
    );
    return { error: "Something went wrong. Please try again." };
  }
  if (!wishlistItem) {
    return { error: "Wishlist item not found." };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, stock, is_active")
    .eq("id", wishlistItem.product_id)
    .maybeSingle();

  if (productError) {
    console.error(
      `moveWishlistItemToCart: failed to look up product "${wishlistItem.product_id}"`,
      productError,
    );
    return { error: "Something went wrong. Please try again." };
  }
  if (!product || !product.is_active) {
    return { error: "This product is not available." };
  }
  if (product.stock <= 0) {
    return { error: "This product is out of stock." };
  }

  const { data: existingCartItem, error: cartLookupError } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", product.id)
    .maybeSingle();

  if (cartLookupError) {
    console.error(
      `moveWishlistItemToCart: failed to look up existing cart item for product "${product.id}"`,
      cartLookupError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  const requestedQuantity = (existingCartItem?.quantity ?? 0) + 1;
  const cappedQuantity = Math.min(requestedQuantity, product.stock);

  const { error: cartWriteError } = existingCartItem
    ? await supabase
        .from("cart_items")
        .update({ quantity: cappedQuantity })
        .eq("id", existingCartItem.id)
    : await supabase
        .from("cart_items")
        .insert({ user_id: user.id, product_id: product.id, quantity: cappedQuantity });

  if (cartWriteError) {
    console.error(
      `moveWishlistItemToCart: failed to add product "${product.id}" to cart`,
      cartWriteError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  const { error: deleteError } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("id", wishlistItem.id);

  if (deleteError) {
    // The cart write already succeeded — leaving the wishlist row behind is
    // a harmless duplicate (the product just still shows as wishlisted
    // too), not a broken state, so this still reports success rather than
    // a confusing partial-failure error.
    console.error(
      `moveWishlistItemToCart: failed to remove wishlist item "${wishlistItem.id}" after adding it to cart`,
      deleteError,
    );
  }

  revalidatePath("/wishlist");
  revalidatePath("/cart");
  revalidatePath("/products/[slug]", "page");
  return { success: true };
}
