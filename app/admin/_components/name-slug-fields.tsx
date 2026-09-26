"use client";

import { useState } from "react";

import { SlugField } from "./slug-field";

// The Name + Slug pair shared by the admin product and category forms. Name
// is controlled (same markup as TextField) because SlugField generates from
// its live value, and so it survives the form reset React runs after an
// action returns validation errors — see SlugField.
export function NameSlugFields({
  initialName,
  initialSlug,
  errors,
}: {
  initialName?: string;
  initialSlug?: string;
  errors?: { name?: string[]; slug?: string[] };
}) {
  const [name, setName] = useState(initialName ?? "");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? "name-error" : undefined}
          className="field"
        />
        {errors?.name && (
          <ul id="name-error" className="text-xs text-red-600 dark:text-red-400">
            {errors.name.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <SlugField source={name} initialSlug={initialSlug} errors={errors?.slug} />
    </>
  );
}
