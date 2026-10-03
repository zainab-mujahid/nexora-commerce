import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { checkProductImageStorage } from "@/lib/admin/product-image-storage";
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
  searchParams,
}: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const [product, categories] = await Promise.all([
    getAdminProductById(id),
    getCategories(),
  ]);

  if (!product) notFound();

  const storage = await checkProductImageStorage(product.images);
  // Set by the new-product form after it created the product and uploaded
  // its images; only decides whether to show the summary, never its content
  // beyond a count of failed uploads.
  const justCreated = query.created === "1";
  const failedUploads = typeof query.imageErrors === "string" && /^[1-8]$/.test(query.imageErrors) ? Number(query.imageErrors) : 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/products", label: "Products" }}
        description={product.name}
      >
        Edit product
      </AdminPageHeader>
      {justCreated && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${failedUploads > 0 ? "border-warning/40 bg-fill/40" : "border-success/30 bg-success/10"}`}
        >
          <strong className="font-semibold">Product created.</strong>{" "}
          {failedUploads > 0
            ? `${failedUploads === 1 ? "1 image" : `${failedUploads} images`} couldn't be uploaded — add ${failedUploads === 1 ? "it" : "them"} again below.`
            : product.images.length > 0
              ? "Its images are below — choose the primary image, reorder or add more."
              : "Add its images below."}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProductForm product={product} categories={categories} />
        <section id="images" aria-labelledby="product-images-heading" className="flex scroll-mt-24 flex-col gap-3">
          <h2 id="product-images-heading" className="text-base font-semibold">Images</h2>
          <ProductImageManager productId={product.id} images={product.images} storage={storage} />
        </section>
      </div>
    </div>
  );
}
