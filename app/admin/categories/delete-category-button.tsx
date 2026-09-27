"use client";

import { deleteCategory } from "@/lib/admin/categories";

export function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  return (
    <form
      action={deleteCategory.bind(null, categoryId)}
      onSubmit={(event) => {
        if (
          !confirm(
            "Delete this category? Its products keep their other details but lose this category.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="link-action link-danger inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M4 6h12M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6" />
        </svg>
        Delete
      </button>
    </form>
  );
}
