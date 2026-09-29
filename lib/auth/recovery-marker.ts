import "server-only";

import { cookies } from "next/headers";

// A Supabase recovery link signs the user in with an ordinary session, which is
// indistinguishable (from here) from a session created by the login form. This
// marker records that the session in this browser was established by a
// recovery link, so /reset-password only offers a password change to someone
// who actually came through /auth/confirm with a valid recovery token — not to
// anyone who happens to be signed in.
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
