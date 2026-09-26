"use client";

import { useActionState } from "react";

import { NameSlugFields } from "@/app/admin/_components/name-slug-fields";
import { submitWithoutReset } from "@/app/admin/_components/submit-without-reset";
import { createCategory, updateCategory } from "@/lib/admin/categories";
import type { Category } from "@/lib/catalog/types";

export function CategoryForm({ category }: { category?: Category }) {
  const action = category
    ? updateCategory.bind(null, category.id)
    : createCategory;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="flex max-w-md flex-col gap-4"
    >
      <NameSlugFields
        initialName={category?.name}
        initialSlug={category?.slug}
        errors={state?.errors}
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
          className="field"
        />
        {state?.errors?.description && (
          <ul className="text-xs text-red-600 dark:text-red-400">
            {state.errors.description.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary self-start"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
