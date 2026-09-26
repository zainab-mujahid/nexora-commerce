"use client";

import { useRef, useState } from "react";

import { slugify } from "@/lib/admin/slugify";

// The Slug input of the admin product/category forms.
//
// New entity (no initialSlug): the slug follows the Name (`source`) until
// the admin takes it over — by clicking the field, clicking the pencil, or
// typing in it — and from then on keeps whatever they set for the rest of
// this form session.
//
// Existing entity (initialSlug given): the slug starts out as the admin's
// own and never follows the Name — a published slug is the page's URL, and
// there is no redirect from an old slug — so it only changes when edited
// explicitly, with a warning once it differs from the saved one.
//
// Controlled on purpose: React resets a <form action={...}>'s uncontrolled
// fields after every action run, including one that returns validation
// errors, which would wipe the typed slug. Generation is UX only; the
// server validates the submitted value as-is.
export function SlugField({
  source,
  initialSlug,
  errors,
}: {
  source: string;
  initialSlug?: string;
  errors?: string[];
}) {
  const isExisting = initialSlug !== undefined;
  // null while the slug is still following the Name.
  const [customSlug, setCustomSlug] = useState<string | null>(
    initialSlug ?? null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const value = customSlug ?? slugify(source);
  const following = customSlug === null;
  const changed = isExisting && value.trim() !== initialSlug;

  function startEditing() {
    if (following) setCustomSlug(value);
  }

  function editFromPencil() {
    startEditing();
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  const hint = errors
    ? undefined
    : following
      ? "Generated from the name."
      : !isExisting
        ? "Custom slug. Changing the name won't update it."
        : undefined;

  const describedBy = [
    errors && "slug-error",
    hint && "slug-hint",
    changed && "slug-warning",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="slug" className="text-sm font-medium">
        Slug
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id="slug"
          name="slug"
          type="text"
          value={value}
          onClick={startEditing}
          onChange={(event) => setCustomSlug(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="field w-full pr-9"
        />
        <button
          type="button"
          onClick={editFromPencil}
          aria-label="Edit slug"
          className="group absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-subtle hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground/40"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
            <path d="m11.5 5.5 3 3" />
          </svg>
          {/* Visual tooltip only — the button's aria-label already names it. */}
          <span
            aria-hidden="true"
            data-tooltip
            className="pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-xs font-medium text-background opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            Edit
          </span>
        </button>
      </div>
      {hint && (
        <p id="slug-hint" className="text-xs text-muted">
          {hint}
        </p>
      )}
      {errors && (
        <ul id="slug-error" className="text-xs text-red-600 dark:text-red-400">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div aria-live="polite">
        {changed && (
          <p id="slug-warning" className="text-xs text-amber-700 dark:text-amber-400">
            Changing the slug changes this page&apos;s URL. Existing links to
            the old URL may stop working.
          </p>
        )}
      </div>
    </div>
  );
}
