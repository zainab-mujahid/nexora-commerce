import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { setRecoveryMarker } from "@/lib/auth/recovery-marker";
import { createClient } from "@/lib/supabase/server";

// Target of the links in Supabase's auth emails (signup confirmation and
// password recovery). Exchanging the token here (rather than client-side) lets
// the session cookies be set on the redirect response itself.
//
// Two link shapes arrive here:
// - `token_hash` + `type`: an email template that links straight to this route.
//   Works in any browser, since verifying needs nothing stored locally.
// - `code`: Supabase's default template, which verifies on Supabase's side and
//   redirects here with a PKCE code. Exchanging it needs the code verifier
//   cookie written when the email was requested, so it only succeeds in that
//   same browser.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only chooses where a failed link lands; whether a session is a recovery
  // session is decided below from what Supabase verified, never from the URL.
  const invalidLink =
    type === "recovery"
      ? "/forgot-password?error=invalid_link"
      : "/login?error=invalid_link";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error || !data.user) {
      redirect(invalidLink);
    }

    // A recovery token hash only verifies as type "recovery", so this can't
    // be reached with a signup or magic-link token relabelled in the URL.
    if (type === "recovery") {
      await setRecoveryMarker(data.user.id);
      redirect("/reset-password");
    }

    redirect("/");
  }

  if (code) {
    const flowId = searchParams.get("sb_flow_id");
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (error || !data.user) {
      redirect(invalidLink);
    }

    // redirectType comes from the code verifier cookie this app stored when
    // resetPasswordForEmail() ran, not from anything in the link. auth-js
    // returns it at runtime but leaves it out of the declared response type.
    const { redirectType } = data as { redirectType?: string | null };
    if (redirectType === "recovery") {
      await setRecoveryMarker(data.user.id);
      redirect("/reset-password");
    }

    redirect("/");
  }

  redirect(invalidLink);
}
