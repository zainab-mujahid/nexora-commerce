"use client";

import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { updateProfile } from "@/lib/account/actions";

export function AccountForm({ defaultFullName }: { defaultFullName: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={defaultFullName}
        errors={state?.errors?.fullName}
      />

      {state?.message && (
        <p
          className={
            state.success ? "text-sm text-success" : "text-sm text-red-600 dark:text-red-400"
          }
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary self-start"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
