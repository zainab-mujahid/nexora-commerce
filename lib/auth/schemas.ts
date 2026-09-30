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

// Must match "Email OTP Length" in the Supabase Dashboard (Authentication ->
// Sign In / Providers -> Email). Supabase generates and checks the code; this
// only shapes the input and rejects obviously malformed codes before a
// verification attempt is spent on them.
export const RECOVERY_CODE_LENGTH = 6;

export const recoveryCodeSchema = z
  .string()
  // Pasted codes often carry spaces or dashes ("123 456").
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .min(1, { error: "Enter the code from your email." })
      .regex(new RegExp(`^\\d{${RECOVERY_CODE_LENGTH}}$`), {
        error: `Enter all ${RECOVERY_CODE_LENGTH} digits of the code.`,
      }),
  );

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

// The in-progress reset: the email a code was requested for, and when (epoch
// ms, used only to pace the "Resend code" button).
export type PendingRecovery = { email: string; sentAt: number };

export type ForgotPasswordState =
  | {
      errors?: { email?: string[] };
      message?: string;
      sent?: PendingRecovery;
    }
  | undefined;

export type VerifyRecoveryCodeState =
  | {
      errors?: { code?: string[] };
      message?: string;
      // The pending request is gone (expired or cleared) — the user has to
      // start over from the email step.
      restart?: boolean;
    }
  | undefined;

export type ResendRecoveryCodeState =
  | { sent?: PendingRecovery; message?: string; restart?: boolean }
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
