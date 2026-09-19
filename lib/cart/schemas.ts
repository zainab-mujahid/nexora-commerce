import * as z from "zod";

// A sane upper bound distinct from a product's actual stock — actions still
// cap to whatever stock allows on top of this.
const MAX_CART_ITEM_QUANTITY = 99;

const quantityField = z.coerce
  .number({ error: "Enter a valid quantity." })
  .int({ error: "Quantity must be a whole number." })
  .min(1, { error: "Quantity must be at least 1." })
  .max(MAX_CART_ITEM_QUANTITY, {
    error: `Quantity must be ${MAX_CART_ITEM_QUANTITY} or fewer.`,
  });

export const addToCartSchema = z.object({
  productId: z.uuid(),
  quantity: quantityField,
});

export const updateCartItemQuantitySchema = z.object({
  cartItemId: z.uuid(),
  quantity: quantityField,
});

export const removeCartItemSchema = z.object({
  cartItemId: z.uuid(),
});

export type CartActionState =
  | { success: true; message?: string }
  | { error: string }
  | undefined;
