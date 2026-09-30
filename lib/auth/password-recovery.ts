"use server";

import { isAuthApiError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  clearPendingRecovery,
  clearRecoveryMarker,
  getPendingRecovery,
  hasRecoveryMarker,
  setPendingRecovery,
  setRecoveryMarker,
} from "./recovery-marker";
import {
  forgotPasswordSchema,
  recoveryCodeSchema,
  resetPasswordSchema,
  type ForgotPasswordState,
  type ResendRecoveryCodeState,
  type ResetPasswordState,
  type VerifyRecoveryCodeState,
} from "./schemas";

// Asks Supabase to email a recovery code. Returns false only when the request
// couldn't be made at all (network failure, Auth outage) — never in a way that
// depends on whether the email has an account.
async function sendRecoveryEmail(email: string, caller: string) {
  const supabase = await createClient();
  // The email template shows the code ({{ .Token }}). redirectTo only matters
  // if the template still contains a link (e.g. emails sent before the switch
  // to codes): it keeps such links on the marker-gated /auth/confirm path.
  // Supabase only honours it when it matches the project's Redirect URLs
  // allow-list, so a spoofed Origin can't send a link anywhere unlisted.
  const origin = (await headers()).get("origin");

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}/auth/confirm?type=recovery` : undefined,
    });

    // Supabase answers an unknown email with success, but a known one can
    // produce distinguishable errors (per-user rate limits, send failures).
    // Surfacing those would reveal which emails have accounts, so any API
    // error still gets the neutral response. Log only the code — never the
    // email.
    if (error && !isAuthApiError(error)) throw error;
    if (error) {
      console.error(
        `${caller}: Supabase rejected the request (${error.status ?? "?"} ${error.code ?? "unknown"})`,
      );
    }
  } catch (error) {
    console.error(
      `${caller}: request failed`,
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }

  return true;
}

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

  const { email } = validatedFields.data;
  if (!(await sendRecoveryEmail(email, "requestPasswordReset"))) {
    // Nothing about the account is revealed, and the user needs to know to
    // try again.
    return {
      message:
        "We couldn't send the code right now. Please check your connection and try again.",
    };
  }

  const pending = { email, sentAt: Date.now() };
  await setPendingRecovery(pending);
  return { sent: pending };
}

const RESTART = {
  restart: true,
  message:
    "This reset request has expired. Enter your email again to get a new code.",
} as const;

export async function resendRecoveryCode(): Promise<ResendRecoveryCodeState> {
  const pending = await getPendingRecovery();
  if (!pending) return RESTART;

  if (!(await sendRecoveryEmail(pending.email, "resendRecoveryCode"))) {
    return {
      message:
        "We couldn't send a new code right now. Please check your connection and try again.",
    };
  }

  // Supabase replaces the previous code, so only the newest one works.
  const next = { email: pending.email, sentAt: Date.now() };
  await setPendingRecovery(next);
  return { sent: next };
}

export async function cancelPasswordReset() {
  await clearPendingRecovery();
}

export async function verifyRecoveryCode(
  _state: VerifyRecoveryCodeState,
  formData: FormData,
): Promise<VerifyRecoveryCodeState> {
  const validatedCode = recoveryCodeSchema.safeParse(formData.get("code"));
  if (!validatedCode.success) {
    return { errors: { code: z.flattenError(validatedCode.error).formErrors } };
  }

  // The email comes from the request this browser made, not from the form.
  const pending = await getPendingRecovery();
  if (!pending) return RESTART;

  const supabase = await createClient();
  let userId: string;

  try {
    // Supabase checks the code against the one it emailed, enforces its
    // expiry and single use, and on success returns a session (written to
    // this browser's cookies by the server client). A code issued for signup
    // or a magic link doesn't verify as type "recovery".
    const { data, error } = await supabase.auth.verifyOtp({
      email: pending.email,
      token: validatedCode.data,
      type: "recovery",
    });

    if (error || !data.user) {
      if (error && !isAuthApiError(error)) throw error;
      // Never log the code or the email.
      console.error(
        `verifyRecoveryCode: verification failed (${error?.status ?? "?"} ${error?.code ?? "no_user"})`,
      );

      if (error?.status === 429 || error?.code === "over_request_rate_limit") {
        return {
          message:
            "Too many attempts. Wait a few minutes, then try again or request a new code.",
        };
      }
      // Supabase answers wrong, expired, already-used and unknown-email codes
      // alike ("otp_expired"), so this reveals nothing about the account.
      return {
        errors: {
          code: [
            "That code is incorrect or has expired. Check the most recent email, or request a new code.",
          ],
        },
      };
    }

    userId = data.user.id;
  } catch (error) {
    console.error(
      "verifyRecoveryCode: request failed",
      error instanceof Error ? error.name : "unknown error",
    );
    return {
      message:
        "We couldn't reach the server. Please check your connection and try again.",
    };
  }

  await setRecoveryMarker(userId);
  await clearPendingRecovery();

  revalidatePath("/", "layout");
  redirect("/reset-password");
}

const SESSION_EXPIRED: ResetPasswordState = {
  sessionExpired: true,
  message:
    "Your password reset session has expired or was already used. Request a new code to continue.",
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

  // The verified code signed this browser in, and whoever triggered a reset may
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
