"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { TextField } from "@/app/_components/text-field";
import { requestPasswordReset } from "@/lib/auth/password-recovery";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );
  // Lets "Send another link" bring the form back without discarding the
  // action state (useActionState has no reset).
  const [dismissedState, setDismissedState] = useState<typeof state>();

  if (state?.sent && state !== dismissedState) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          If an account exists for this email, we&apos;ve sent password reset
          instructions.
        </p>
        <p className="text-sm text-muted">
          The link expires after a while, so use it soon. Don&apos;t see it?
          Check your spam folder.
        </p>
        <Link href="/login" className="btn btn-primary">
          Back to sign in
        </Link>
        <button
          type="button"
          onClick={() => setDismissedState(state)}
          className="link-action self-center text-sm font-normal text-muted hover:text-foreground"
        >
          Send another link
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Forgot your password?
        </h1>
        <p className="text-sm text-muted">
          Enter the email associated with your account and we&apos;ll send you a
          link to reset your password.
        </p>
      </div>

      <TextField
        label="Email"
        name="email"
        type="email"
        placeholder="name@example.com"
        autoComplete="email"
        errors={state?.errors?.email}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
