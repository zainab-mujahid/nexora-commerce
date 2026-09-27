import type { Metadata } from "next";

import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";

import { CategoryForm } from "../category-form";

export const metadata: Metadata = {
  title: "New category",
};

export default function NewCategoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader back={{ href: "/admin/categories", label: "Categories" }}>New category</AdminPageHeader>
      <CategoryForm />
    </div>
  );
}
