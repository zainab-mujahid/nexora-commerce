import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCategoryById } from "@/lib/catalog/categories";

import { CategoryForm } from "../category-form";

export async function generateMetadata({
  params,
}: PageProps<"/admin/categories/[id]">): Promise<Metadata> {
  const { id } = await params;
  const category = await getCategoryById(id);

  return { title: category ? `Edit ${category.name}` : "Category" };
}

export default async function EditCategoryPage({
  params,
}: PageProps<"/admin/categories/[id]">) {
  const { id } = await params;
  const category = await getCategoryById(id);

  if (!category) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit category</h1>
      <CategoryForm category={category} />
    </div>
  );
}
