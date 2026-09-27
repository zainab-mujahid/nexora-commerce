import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { getCategories } from "@/lib/catalog/categories";

import { DeleteCategoryButton } from "./delete-category-button";

export const metadata: Metadata = {
  title: "Categories",
};

export default async function AdminCategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description={`${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        action={
          <Link href="/admin/categories/new" className="btn btn-primary">
            New category
          </Link>
        }
      >
        Categories
      </AdminPageHeader>

      {categories.length === 0 ? (
        <EmptyState message="No categories yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr
                  key={category.id}>
                  <td className="font-medium">{category.name}</td>
                  <td data-label="Slug" className="font-mono text-xs text-muted [overflow-wrap:anywhere]">
                    {category.slug}
                  </td>
                  <td data-label="Description" className="max-w-md text-muted">
                    <span className="line-clamp-2">{category.description || "—"}</span>
                  </td>
                  <td className="cell-actions">
                    <div className="flex justify-end gap-4 whitespace-nowrap">
                      <Link
                        href={`/admin/categories/${category.id}`}
                        className="link-action"
                      >
                        Edit
                      </Link>
                      <DeleteCategoryButton categoryId={category.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
