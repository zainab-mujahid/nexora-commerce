"use client";

import Link from "next/link";
import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { login } from "@/lib/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Sign in</h1>

      {next && <input type="hidden" name="next" value={next} />}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        errors={state?.errors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        errors={state?.errors?.password}
      />

      {state?.message && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-sm text-muted">
        No account?{" "}
        <Link href="/signup" className="underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
