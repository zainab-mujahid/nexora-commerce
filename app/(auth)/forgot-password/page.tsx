import type { Metadata } from "next";

import { getPendingRecovery } from "@/lib/auth/recovery-marker";

import { ForgotPasswordFlow } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const { error } = await searchParams;
  // Resumes at the code step if this browser already requested a code (e.g.
  // after a reload while the user was reading the email).
  const pendingRecovery = await getPendingRecovery();

  return (
    <div className="flex flex-col gap-4">
      {/* Only reachable from a reset link in an email sent before the switch
          to verification codes, via /auth/confirm. */}
      {error === "invalid_link" && !pendingRecovery && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-foreground"
        >
          That password reset link is invalid or has expired. Enter your email
          to get a verification code instead.
        </p>
      )}
      <ForgotPasswordFlow initialRequest={pendingRecovery} />
    </div>
  );
}
