import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { getCategories } from "@/lib/catalog/categories";
import { getAdminProductById } from "@/lib/catalog/products";

import { ProductForm } from "../product-form";
import { ProductImageManager } from "../product-image-manager";

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
      <AdminPageHeader
        back={{ href: "/admin/products", label: "Products" }}
        description={product.name}
      >
        Edit product
      </AdminPageHeader>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProductForm product={product} categories={categories} />
        <section aria-labelledby="product-images-heading" className="flex flex-col gap-3">
          <h2 id="product-images-heading" className="text-base font-semibold">Images</h2>
          <ProductImageManager productId={product.id} images={product.images} />
        </section>
      </div>
    </div>
  );
}
