"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent } from "react";

import { TextField } from "@/app/_components/text-field";
import { NameSlugFields } from "@/app/admin/_components/name-slug-fields";
import { submitWithoutReset } from "@/app/admin/_components/submit-without-reset";
import { setProductImagePrimary } from "@/lib/admin/product-images";
import { createProduct, updateProduct } from "@/lib/admin/products";
import type { ProductFormState } from "@/lib/admin/schemas";
import type { Category, ProductDetail } from "@/lib/catalog/types";

import { NewProductImages, type PickedImage } from "./new-product-images";
import { uploadProductImage } from "./product-image-upload";

export function ProductForm({
  product,
  categories,
}: {
  product?: ProductDetail;
  categories: Category[];
}) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct;
  const [actionState, formAction, actionPending] = useActionState(action, undefined);
  const router = useRouter();

  // New product with images: create it, then upload each selected file
  // through the normal S3 flow under the new id, then open its edit page.
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<ProductFormState>(undefined);
  const [progress, setProgress] = useState<string | null>(null);
  const creating = progress !== null;
  const state = createState ?? actionState;
  const pending = actionPending || creating;

  async function createWithImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    formData.set("withImages", "1");
    setCreateState(undefined);
    setProgress("Saving product…");
    const result = await createProduct(undefined, formData);
    if (!result?.createdId) {
      setCreateState(result ?? { message: "Something went wrong. Please try again." });
      setProgress(null);
      return;
    }
    const productId = result.createdId;
    // The product exists from here on; image problems never undo it — they
    // are reported on its edit page, where they can be retried.
    let failed = 0;
    let primaryImageId: string | null = null;
    for (const [index, image] of picked.entries()) {
      setProgress(`Uploading image ${index + 1} of ${picked.length}…`);
      try {
        const uploaded = await uploadProductImage(productId, image.file);
        if ("error" in uploaded) failed++;
        else if (image.id === primaryId) primaryImageId = uploaded.imageId;
      } catch {
        failed++;
      }
    }
    // The first stored image is primary by default; honour another choice.
    if (primaryImageId) await setProductImagePrimary(primaryImageId).catch(() => undefined);
    router.push(`/admin/products/${productId}?created=1${failed > 0 ? `&imageErrors=${failed}` : ""}#images`);
  }

  return (
    <form
      action={formAction}
      onSubmit={!product && picked.length > 0 ? createWithImages : submitWithoutReset(formAction)}
      className="card flex flex-col gap-5 p-5 sm:p-6"
    >
      <NameSlugFields
        initialName={product?.name}
        initialSlug={product?.slug}
        errors={state?.errors}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ""}
          rows={4}
          className="field"
        />
        {state?.errors?.description && (
          <ul className="text-xs text-red-600 dark:text-red-400">
            {state.errors.description.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Price"
          name="price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={product?.price}
          errors={state?.errors?.price}
        />
        <TextField
          label="Stock"
          name="stock"
          type="number"
          min="0"
          step="1"
          required
          defaultValue={product?.stock}
          errors={state?.errors?.stock}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="categoryId" className="text-sm font-medium">
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={product?.category?.id ?? ""}
          className="field"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {state?.errors?.categoryId && (
          <ul className="text-xs text-red-600 dark:text-red-400">
            {state.errors.categoryId.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm font-medium transition-colors hover:border-input">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={product?.is_active ?? true}
          className="h-4 w-4"
        />
        Active (visible to customers)
      </label>

      {!product && (
        <div className="border-t border-border pt-5">
          <NewProductImages
            images={picked}
            primaryId={primaryId}
            disabled={pending}
            onChange={setPicked}
            onPrimaryChange={(id) => setPrimaryId(id || null)}
            error={pickError}
            onError={setPickError}
          />
        </div>
      )}

      {state?.message && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {progress ?? (pending ? "Saving…" : "Save")}
        </button>
        <Link href="/admin/products" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
