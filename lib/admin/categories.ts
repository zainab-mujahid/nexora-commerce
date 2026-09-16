"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { categorySchema, type CategoryFormState } from "./schemas";

// Postgres unique_violation — raised by the `categories.slug` unique
// constraint when a slug collides with an existing row.
const UNIQUE_VIOLATION = "23505";

export async function createCategory(
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  // Server Actions are reachable by direct POST, not only through this
  // form, so admin status is re-verified here regardless of what the page
  // (or app/admin/layout.tsx) already checked.
  await requireAdmin();

  const validatedFields = categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, slug, description } = validatedFields.data;
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    name,
    slug,
    description: description || null,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error("createCategory: failed to create category", error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/admin/categories");
}

export async function updateCategory(
  id: string,
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const validatedFields = categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, slug, description } = validatedFields.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name, slug, description: description || null })
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error(`updateCategory: failed to update category "${id}"`, error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/admin/categories");
}

// products.category_id is `on delete set null`, so this only ever detaches
// products from the deleted category rather than touching them.
export async function deleteCategory(id: string) {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    console.error(`deleteCategory: failed to delete category "${id}"`, error);
    throw new Error("Failed to delete category");
  }

  revalidatePath("/", "layout");
}
