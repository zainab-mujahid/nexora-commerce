import * as z from "zod";

// Shared by signup and password reset so a reset can never set a password that
// signup would have rejected (or vice versa).
const passwordSchema = z
  .string()
  .min(8, { error: "Be at least 8 characters long." })
  .regex(/[a-zA-Z]/, { error: "Contain at least one letter." })
  .regex(/[0-9]/, { error: "Contain at least one number." });

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(80, { error: "Name must be 80 characters or fewer." }),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Please enter your password." }),
});

export type AuthFormState =
  | {
      errors?: {
        fullName?: string[];
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z
      .string()
      .min(1, { error: "Please confirm your new password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type ForgotPasswordState =
  | {
      errors?: { email?: string[] };
      message?: string;
      sent?: boolean;
    }
  | undefined;

export type ResetPasswordState =
  | {
      errors?: { password?: string[]; confirmPassword?: string[] };
      message?: string;
      // The recovery session is gone (expired, or used in another tab) — the
      // form can't succeed, so the UI points back to /forgot-password.
      sessionExpired?: boolean;
    }
  | undefined;
