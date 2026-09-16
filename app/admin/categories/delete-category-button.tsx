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
      <button type="submit" className="text-red-600 hover:opacity-70">
        Delete
      </button>
    </form>
  );
}
