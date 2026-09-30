"use client";

import Link from "next/link";
import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { updatePassword } from "@/lib/auth/password-recovery";

import { KeyIcon, RecoveryHeader, RecoverySteps } from "../_components/recovery-ui";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <RecoverySteps current={3} />
      <RecoveryHeader icon={<KeyIcon />} title="Set a new password">
        <p>
          You          Code verified. Choose a new password for your Nexora account.apos;re verified. Choose a new password for your Nexora account.
        </p>
      </RecoveryHeader>

      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        errors={state?.errors?.password}
      />
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={state?.errors?.confirmPassword}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      {state?.sessionExpired ? (
        <Link href="/forgot-password" className="btn btn-primary">
          Request a new code
        </Link>
      ) : (
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Updating password…" : "Update password"}
        </button>
      )}
    </form>
  );
}
