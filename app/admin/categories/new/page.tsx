import type { Metadata } from "next";

import { CategoryForm } from "../category-form";

export const metadata: Metadata = {
  title: "New category",
};

export default function NewCategoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New category</h1>
      <CategoryForm />
    </div>
  );
}
