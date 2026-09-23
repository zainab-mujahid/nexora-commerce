import * as z from "zod";

export const addressSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be 100 characters or fewer." }),
  line1: z
    .string()
    .trim()
    .min(3, { error: "Address must be at least 3 characters long." })
    .max(200, { error: "Address must be 200 characters or fewer." }),
  line2: z
    .string()
    .trim()
    .max(200, { error: "Address line 2 must be 200 characters or fewer." })
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .trim()
    .min(2, { error: "City must be at least 2 characters long." })
    .max(100, { error: "City must be 100 characters or fewer." }),
  state: z
    .string()
    .trim()
    .max(100, { error: "State/province must be 100 characters or fewer." })
    .optional()
    .or(z.literal("")),
  postalCode: z
    .string()
    .trim()
    .min(2, { error: "Enter a valid postal code." })
    .max(20, { error: "Postal code must be 20 characters or fewer." }),
  country: z
    .string()
    .trim()
    .min(2, { error: "Country must be at least 2 characters long." })
    .max(100, { error: "Country must be 100 characters or fewer." }),
});

export type AddressFormState =
  | {
      errors?: {
        fullName?: string[];
        line1?: string[];
        line2?: string[];
        city?: string[];
        state?: string[];
        postalCode?: string[];
        country?: string[];
      };
      message?: string;
    }
  | undefined;
