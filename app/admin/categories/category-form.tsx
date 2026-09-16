"use client";

import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { createCategory, updateCategory } from "@/lib/admin/categories";
import type { Category } from "@/lib/catalog/types";

export function CategoryForm({ category }: { category?: Category }) {
  const action = category
    ? updateCategory.bind(null, category.id)
    : createCategory;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label="Name"
        name="name"
        defaultValue={category?.name}
        errors={state?.errors?.name}
      />
      <TextField
        label="Slug"
        name="slug"
        defaultValue={category?.slug}
        errors={state?.errors?.slug}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={category?.description ?? ""}
          rows={3}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        />
        {state?.errors?.description && (
          <ul className="text-xs text-red-600">
            {state.errors.description.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
