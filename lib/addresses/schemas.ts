import { parsePhoneNumberFromString } from "libphonenumber-js";
import * as z from "zod";

// Structural validation only — parsing/formatting rules per country, via a
// maintained library instead of hand-rolled per-country regexes. This
// proves the number is *shaped* like a real number for its country; it
// says nothing about whether it's reachable or actually belongs to the
// customer (that would need SMS/OTP verification, deliberately out of
// scope here — a separate future feature).
//
// A leading "+" with country code is required (no default country is
// assumed) since customers may be shipping to one country on a phone
// number from another. Normalizes to E.164 (e.g. "+923001234567") before
// it ever reaches the database, so every stored number is in one
// consistent, unambiguous format regardless of how it was typed.
const phoneField = z
  .string()
  .trim()
  .min(1, { error: "Enter a phone number." })
  .max(40, { error: "Enter a valid phone number." })
  .transform((value, ctx) => {
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed || !parsed.isValid()) {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter a valid phone number with a country code, e.g. +923001234567.",
      });
      return z.NEVER;
    }
    return parsed.format("E.164");
  });

export const addressSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be 100 characters or fewer." }),
  phone: phoneField,
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
        phone?: string[];
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
