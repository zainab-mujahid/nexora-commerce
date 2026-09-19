"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import {
  addToCartSchema,
  removeCartItemSchema,
  updateCartItemQuantitySchema,
  type CartActionState,
} from "./schemas";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getPurchasableProduct(supabase: SupabaseServerClient, productId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, stock, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error(`getPurchasableProduct: failed to look up product "${productId}"`, error);
    throw new Error("Failed to look up product");
  }

  return data as { id: string; stock: number; is_active: boolean } | null;
}

// Adds to any existing quantity for this product rather than creating a
// second row — cart_items has a unique(user_id, product_id) constraint, and
// "add to cart" on a product already in the cart is expected to increase
// it, not error.
export async function addToCart(
  productId: string,
  _prevState: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  // Server Actions are reachable by direct POST, not only through the
  // rendered form, so the session must be re-verified here.
  const user = await requireUser();

  const parsed = addToCartSchema.safeParse({
    productId,
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid quantity." };
  }

  const supabase = await createClient();
  const product = await getPurchasableProduct(supabase, parsed.data.productId);
  if (!product || !product.is_active) {
    return { error: "This product is not available." };
  }
  if (product.stock <= 0) {
    return { error: "This product is out of stock." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", product.id)
    .maybeSingle();

  if (existingError) {
    console.error(
      `addToCart: failed to look up existing cart item for product "${product.id}"`,
      existingError,
    );
    return { error: "Something went wrong. Please try again." };
  }

  const requestedQuantity = (existing?.quantity ?? 0) + parsed.data.quantity;
  // Never let a cart quantity exceed current stock — the authoritative
  // check happens again at checkout (Step 15), but the cart itself should
  // never silently promise more than is available.
  const cappedQuantity = Math.min(requestedQuantity, product.stock);

  const { error } = existing
    ? await supabase
        .from("cart_items")
        .update({ quantity: cappedQuantity })
        .eq("id", existing.id)
    : await supabase
        .from("cart_items")
        .insert({ user_id: user.id, product_id: product.id, quantity: cappedQuantity });

  if (error) {
    console.error(`addToCart: failed to add product "${product.id}" to cart`, error);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/cart");

  if (cappedQuantity < requestedQuantity) {
    return {
      success: true,
      message: `Only ${product.stock} in stock — your cart now has ${cappedQuantity}.`,
    };
  }
  return { success: true };
}

export async function updateCartItemQuantity(
  cartItemId: string,
  _prevState: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await requireUser();

  const parsed = updateCartItemQuantitySchema.safeParse({
    cartItemId,
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid quantity." };
  }

  const supabase = await createClient();
  // Ownership is derived from the row itself (scoped to this session's own
  // user_id), never trusted from the client beyond "which row" — the same
  // pattern used throughout lib/admin for id-addressed mutations.
  const { data: item, error: itemError } = await supabase
    .from("cart_items")
    .select("id, product:products(id, stock, is_active)")
    .eq("id", parsed.data.cartItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (itemError) {
    console.error(
      `updateCartItemQuantity: failed to look up cart item "${parsed.data.cartItemId}"`,
      itemError,
    );
    return { error: "Something went wrong. Please try again." };
  }
  if (!item) {
    return { error: "Cart item not found." };
  }

  const product = item.product as unknown as {
    id: string;
    stock: number;
    is_active: boolean;
  };

  if (!product.is_active) {
    return { error: "This product is no longer available. Remove it from your cart." };
  }
  if (product.stock <= 0) {
    return { error: "This product is out of stock. Remove it from your cart." };
  }

  const cappedQuantity = Math.min(parsed.data.quantity, product.stock);

  const { error } = await supabase
    .from("cart_items")
    .update({ quantity: cappedQuantity })
    .eq("id", item.id);

  if (error) {
    console.error(`updateCartItemQuantity: failed to update cart item "${item.id}"`, error);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/cart");

  if (cappedQuantity < parsed.data.quantity) {
    return {
      success: true,
      message: `Only ${product.stock} in stock — quantity set to ${cappedQuantity}.`,
    };
  }
  return { success: true };
}

export async function removeCartItem(cartItemId: string): Promise<void> {
  const user = await requireUser();

  const parsed = removeCartItemSchema.safeParse({ cartItemId });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", parsed.data.cartItemId)
    .eq("user_id", user.id);

  if (error) {
    console.error(`removeCartItem: failed to remove cart item "${cartItemId}"`, error);
    throw new Error("Failed to remove cart item");
  }

  revalidatePath("/cart");
}
