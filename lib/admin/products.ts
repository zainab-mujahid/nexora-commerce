"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { productSchema, type ProductFormState } from "./schemas";

// Postgres unique_violation — raised by the `products.slug` unique
// constraint when a slug collides with an existing row.
const UNIQUE_VIOLATION = "23505";

function parseProductFields(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    price: formData.get("price"),
    stock: formData.get("stock"),
    categoryId: formData.get("categoryId"),
  });
}

// Unchecked checkboxes are omitted from FormData entirely, so "isActive" is
// only present (as "true", from the checkbox's own value) when checked.
function parseIsActive(formData: FormData) {
  return formData.get("isActive") === "true";
}

export async function createProduct(
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  // Server Actions are reachable by direct POST, not only through this
  // form, so admin status is re-verified here regardless of what the page
  // (or app/admin/layout.tsx) already checked.
  await requireAdmin();

  const validatedFields = parseProductFields(formData);
  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, slug, description, price, stock, categoryId } = validatedFields.data;
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    name,
    slug,
    description: description || null,
    price,
    stock,
    category_id: categoryId,
    is_active: parseIsActive(formData),
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error("createProduct: failed to create product", error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

export async function updateProduct(
  id: string,
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  const validatedFields = parseProductFields(formData);
  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, slug, description, price, stock, categoryId } = validatedFields.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name,
      slug,
      description: description || null,
      price,
      stock,
      category_id: categoryId,
      is_active: parseIsActive(formData),
    })
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error(`updateProduct: failed to update product "${id}"`, error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

// A quick activate/deactivate toggle from the product list, independent of
// the full edit form.
export async function toggleProductActive(id: string, nextIsActive: boolean) {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: nextIsActive })
    .eq("id", id);

  if (error) {
    console.error(`toggleProductActive: failed to update product "${id}"`, error);
    throw new Error("Failed to update product status");
  }

  revalidatePath("/", "layout");
}
