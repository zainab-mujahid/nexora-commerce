import * as z from "zod";

export const placeOrderSchema = z.object({
  addressId: z.uuid({ error: "Select a shipping address." }),
});

export type CheckoutActionState = { error: string } | undefined;
