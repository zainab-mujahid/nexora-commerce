"use server";

import { isAuthApiError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";

import { createClient } from "@/lib/supabase/server";

import { clearRecoveryMarker, hasRecoveryMarker } from "./recovery-marker";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordState,
  type ResetPasswordState,
} from "./schemas";

export async function requestPasswordReset(
  _state: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const validatedFields = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();
  // Same origin derivation as signup's emailRedirectTo. Supabase only honours
  // redirectTo when it matches the project's Redirect URLs allow-list, and
  // falls back to the Site URL otherwise, so a spoofed Origin can't send the
  // link anywhere unlisted. `type=recovery` only tells /auth/confirm where to
  // send an expired/invalid link — it grants nothing.
  const origin = (await headers()).get("origin");

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      validatedFields.data.email,
      {
        redirectTo: origin ? `${origin}/auth/confirm?type=recovery` : undefined,
      },
    );

    // Supabase answers an unknown email with success, but a known one can
    // produce distinguishable errors (per-user rate limits, send failures).
    // Surfacing those would reveal which emails have accounts, so any API
    // error still gets the neutral response. Log only the code — never the
    // email.
    if (error && !isAuthApiError(error)) throw error;
    if (error) {
      console.error(
        `requestPasswordReset: Supabase rejected the request (${error.status ?? "?"} ${error.code ?? "unknown"})`,
      );
    }
  } catch (error) {
    // Network failure or Auth outage: nothing about the account is revealed,
    // and the user needs to know to try again.
    console.error(
      "requestPasswordReset: request failed",
      error instanceof Error ? error.name : "unknown error",
    );
    return {
      message:
        "We couldn't send the reset link right now. Please check your connection and try again.",
    };
  }

  return { sent: true };
}

const SESSION_EXPIRED: ResetPasswordState = {
  sessionExpired: true,
  message:
    "Your password reset link has expired or was already used. Request a new one to continue.",
};

export async function updatePassword(
  _state: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const validatedFields = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();

  try {
    // Re-checked here, not just when the page rendered: the Server Action is a
    // public endpoint and can be called without ever loading the page.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await hasRecoveryMarker(user.id))) return SESSION_EXPIRED;

    const { error } = await supabase.auth.updateUser({
      password: validatedFields.data.password,
    });

    if (error) {
      if (isAuthApiError(error)) {
        if (error.code === "same_password") {
          return {
            errors: {
              password: ["Choose a password different from your current one."],
            },
          };
        }
        if (error.code === "weak_password") {
          return {
            errors: {
              password: [
                "This password is too weak or too common. Choose a stronger one.",
              ],
            },
          };
        }
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.code === "session_not_found" ||
          error.code === "session_expired"
        ) {
          return SESSION_EXPIRED;
        }
      }

      console.error(
        `updatePassword: update failed (${error.status ?? "?"} ${error.code ?? "unknown"})`,
      );
      return {
        message: "We couldn't update your password. Please try again.",
      };
    }
  } catch (error) {
    console.error(
      "updatePassword: request failed",
      error instanceof Error ? error.name : "unknown error",
    );
    return {
      message:
        "We couldn't reach the server. Please check your connection and try again.",
    };
  }

  // The recovery link signed this browser in, and whoever triggered a reset may
  // have done so because the old password leaked. Revoke every session for the
  // account (not just this one) so the new password is the only way back in.
  // The update already succeeded, so a failed revocation mustn't turn into an
  // error — auth-js clears this browser's session cookies either way.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: "global",
  });
  if (signOutError) {
    console.error(
      `updatePassword: global sign-out failed (${signOutError.code ?? "unknown"})`,
    );
  }
  await clearRecoveryMarker();

  revalidatePath("/", "layout");
  redirect("/reset-password?status=updated");
}
