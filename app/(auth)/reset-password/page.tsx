import type { Metadata } from "next";
import Link from "next/link";

import { getUser } from "@/lib/auth/dal";
import { hasRecoveryMarker } from "@/lib/auth/recovery-marker";

import {
  AlertIcon,
  CheckIcon,
  RecoveryHeader,
  RecoverySteps,
} from "../_components/recovery-ui";
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
      <div className="flex flex-col gap-5">
        <RecoverySteps current={4} />
        <RecoveryHeader icon={<CheckIcon />} tone="success" title="Password updated">
          <p role="status">
            Your password has been changed successfully.
          </p>
        </RecoveryHeader>
        <p className="rounded-md bg-fill px-3 py-2.5 text-sm text-muted">
          For your security, you&apos;ve been signed out on every device. Sign
          in with your new password to continue.
        </p>
        <Link href="/login" className="btn btn-primary">
          Continue to sign in
        </Link>
      </div>
    );
  }

  // Being signed in isn't enough: the marker is only set after this browser
  // verified a recovery code for the same user (see recovery-marker.ts).
  const user = await getUser();
  const hasRecoverySession = user ? await hasRecoveryMarker(user.id) : false;

  if (!hasRecoverySession) {
    return <VerificationRequired />;
  }

  return <ResetPasswordForm />;
}

function VerificationRequired() {
  return (
    <div className="flex flex-col gap-5">
      <RecoveryHeader icon={<AlertIcon />} tone="danger" title="Verification required">
        <p>
          To set a new password, first verify the code we email you. Your
          verification may have expired or already been used.
        </p>
      </RecoveryHeader>
      <Link href="/forgot-password" className="btn btn-primary">
        Get a verification code
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
