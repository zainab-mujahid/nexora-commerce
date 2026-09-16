"use client";

import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { createProduct, updateProduct } from "@/lib/admin/products";
import type { Category, ProductDetail } from "@/lib/catalog/types";

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
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <TextField
        label="Name"
        name="name"
        defaultValue={product?.name}
        errors={state?.errors?.name}
      />
      <TextField
        label="Slug"
        name="slug"
        defaultValue={product?.slug}
        errors={state?.errors?.slug}
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
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        />
        {state?.errors?.description && (
          <ul className="text-xs text-red-600">
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
          defaultValue={product?.price}
          errors={state?.errors?.price}
        />
        <TextField
          label="Stock"
          name="stock"
          type="number"
          min="0"
          step="1"
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
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {state?.errors?.categoryId && (
          <ul className="text-xs text-red-600">
            {state.errors.categoryId.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={product?.is_active ?? true}
          className="h-4 w-4"
        />
        Active (visible to customers)
      </label>

      {state?.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
