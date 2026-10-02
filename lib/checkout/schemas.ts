import * as z from "zod";

// Only "which address" and the server-generated idempotency key come from the
// browser. Amount, currency, prices and payment status never do.
export const startPaymentSchema = z.strictObject({
  addressId: z.uuid({ error: "Select a shipping address." }),
  idempotencyKey: z.uuid(),
});

export type CheckoutActionState = { error: string } | undefined;

export type PaymentActionState = { error?: string; notice?: string } | undefined;
