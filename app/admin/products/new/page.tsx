import type { Metadata } from "next";

import { getCategories } from "@/lib/catalog/categories";

import { ProductForm } from "../product-form";

export const metadata: Metadata = {
  title: "New product",
};

export default async function NewProductPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
