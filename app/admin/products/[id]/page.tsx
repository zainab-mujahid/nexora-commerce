import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCategories } from "@/lib/catalog/categories";
import { getAdminProductById } from "@/lib/catalog/products";

import { ProductForm } from "../product-form";
import { ProductImageUpload } from "../product-image-upload";

export async function generateMetadata({
  params,
}: PageProps<"/admin/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getAdminProductById(id);

  return { title: product ? `Edit ${product.name}` : "Product" };
}

export default async function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getAdminProductById(id),
    getCategories(),
  ]);

  if (!product) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
      <ProductForm product={product} categories={categories} />
      <ProductImageUpload productId={product.id} images={product.images} />
    </div>
  );
}
