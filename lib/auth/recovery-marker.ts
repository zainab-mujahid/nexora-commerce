import "server-only";

import { cookies } from "next/headers";
import * as z from "zod";

import { forgotPasswordSchema, type PendingRecovery } from "./schemas";

// Verifying a Supabase recovery code signs the user in with an ordinary
// session, which is indistinguishable (from here) from a session created by the
// login form. This marker records that the session in this browser was
// established by a verified recovery code (or, for emails sent before the
// switch to codes, a recovery link through /auth/confirm), so /reset-password
// only offers a password change to someone who actually proved control of the
// inbox — not to anyone who happens to be signed in.
//
// It is not a secret and grants nothing on its own: the password update still
// requires the Supabase session, and the value is bound to that session's user
// id so a stale marker can't carry over to a different account signed in later
// in the same browser.
const RECOVERY_MARKER = "nexora-recovery";
const RECOVERY_PATH = "/reset-password";
const RECOVERY_WINDOW_SECONDS = 15 * 60;

// Route Handlers and Server Functions only — cookies are read-only while a
// Server Component renders.
export async function setRecoveryMarker(userId: string) {
  (await cookies()).set(RECOVERY_MARKER, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: RECOVERY_PATH,
    maxAge: RECOVERY_WINDOW_SECONDS,
  });
}

export async function clearRecoveryMarker() {
  (await cookies()).set(RECOVERY_MARKER, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: RECOVERY_PATH,
    maxAge: 0,
  });
}

export async function hasRecoveryMarker(userId: string) {
  return (await cookies()).get(RECOVERY_MARKER)?.value === userId;
}

// The email a recovery code was last requested for in this browser, so the
// code step survives a reload (e.g. a mobile browser discarding the tab while
// the user reads the email) and so verify/resend use the email the request was
// made for rather than one the client supplies later. It proves nothing — the
// code itself is what Supabase verifies — and it lives only as long as a
// Supabase email OTP stays valid by default (1 hour).
const PENDING_RECOVERY = "nexora-recovery-request";
const PENDING_PATH = "/forgot-password";
const PENDING_WINDOW_SECONDS = 60 * 60;

const pendingRecoverySchema = forgotPasswordSchema.extend({
  sentAt: z.number().int().nonnegative(),
});

export async function setPendingRecovery(pending: PendingRecovery) {
  (await cookies()).set(PENDING_RECOVERY, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PENDING_PATH,
    maxAge: PENDING_WINDOW_SECONDS,
  });
}

export async function clearPendingRecovery() {
  (await cookies()).set(PENDING_RECOVERY, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PENDING_PATH,
    maxAge: 0,
  });
}

export async function getPendingRecovery(): Promise<PendingRecovery | null> {
  const raw = (await cookies()).get(PENDING_RECOVERY)?.value;
  if (!raw) return null;

  try {
    const parsed = pendingRecoverySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
