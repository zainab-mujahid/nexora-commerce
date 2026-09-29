import type { Metadata } from "next";
import Link from "next/link";

import { getUser } from "@/lib/auth/dal";
import { hasRecoveryMarker } from "@/lib/auth/recovery-marker";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { status } = await searchParams;

  // Reached only by updatePassword's redirect, after the session was revoked.
  // Shows nothing account-specific, so it needs no session check.
  if (status === "updated") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          Your password has been updated successfully.
        </p>
        <p className="text-sm text-muted">
          For your security, you&apos;ve been signed out everywhere. Sign in with
          your new password to continue.
        </p>
        <Link href="/login" className="btn btn-primary">
          Back to sign in
        </Link>
      </div>
    );
  }

  const user = await getUser();
  const hasRecoverySession = user ? await hasRecoveryMarker(user.id) : false;

  if (!hasRecoverySession) {
    return <InvalidRecoveryLink />;
  }

  return <ResetPasswordForm />;
}

function InvalidRecoveryLink() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reset link unavailable
      </h1>
      <p className="rounded-md border border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">
        This password reset link is invalid, has expired or was already used.
        Request a new one to reset your password.
      </p>
      <Link href="/forgot-password" className="btn btn-primary">
        Request a new link
      </Link>
      <p className="text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
