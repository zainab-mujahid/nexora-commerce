import * as z from "zod";

export const addToWishlistSchema = z.object({
  productId: z.uuid(),
});

export const wishlistItemIdSchema = z.object({
  wishlistItemId: z.uuid(),
});

export type WishlistActionState =
  | { success: true }
  | { error: string }
  | undefined;
