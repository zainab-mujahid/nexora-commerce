import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { getCategories } from "@/lib/catalog/categories";

import { DeleteCategoryButton } from "./delete-category-button";

export const metadata: Metadata = {
  title: "Categories",
};

export default async function AdminCategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Link
          href="/admin/categories/new"
          className="btn btn-primary"
        >
          New category
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState message="No categories yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
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
                  <td className="text-muted">
                    {category.slug}
                  </td>
                  <td className="text-muted">
                    {category.description || "—"}
                  </td>
                  <td>
                    <div className="flex gap-3">
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
