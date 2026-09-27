import type { Metadata } from "next";

import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { getCategories } from "@/lib/catalog/categories";

import { ProductForm } from "../product-form";

export const metadata: Metadata = {
  title: "New product",
};

export default async function NewProductPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader back={{ href: "/admin/products", label: "Products" }}>New product</AdminPageHeader>
      <div className="max-w-2xl">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
