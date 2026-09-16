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
            state.success ? "text-sm text-green-600" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
