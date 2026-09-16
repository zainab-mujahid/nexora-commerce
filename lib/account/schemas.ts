import * as z from "zod";

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(80, { error: "Name must be 80 characters or fewer." }),
});

export type UpdateProfileState =
  | {
      errors?: {
        fullName?: string[];
      };
      message?: string;
      success?: boolean;
    }
  | undefined;
