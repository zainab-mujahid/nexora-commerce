"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { adminResourceIdSchema, categorySchema, type CategoryFormState } from "./schemas";

// Postgres unique_violation — raised by the `categories.slug` unique
// constraint when a slug collides with an existing row.
const UNIQUE_VIOLATION = "23505";

const CATEGORY_NOT_FOUND_MESSAGE = "This category no longer exists.";

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

  // Step 24A: `id` is a bound argument — a malformed value never reaches
  // Postgres (see adminResourceIdSchema in ./schemas).
  if (!adminResourceIdSchema.safeParse(id).success) {
    return { message: CATEGORY_NOT_FOUND_MESSAGE };
  }

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
  // `.select("id")` returns the rows the UPDATE actually matched, so a
  // valid-but-nonexistent id is detected from this one statement instead of
  // redirecting as if the category had been saved.
  const { data: updated, error } = await supabase
    .from("categories")
    .update({ name, slug, description: description || null })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error(`updateCategory: failed to update category "${id}"`, error);
    return { message: "Something went wrong. Please try again." };
  }
  if (updated.length === 0) {
    return { message: CATEGORY_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/", "layout");
  redirect("/admin/categories");
}

// products.category_id is `on delete set null`, so this only ever detaches
// products from the deleted category rather than touching them. Bound to a
// plain <form action> (void). Step 24A: a malformed id returns before any
// query instead of throwing a Postgres uuid error into the admin error page,
// and `.select("id")` reports what the DELETE actually removed, so a valid id
// matching no row returns without revalidating rather than acting as if a
// category was deleted.
export async function deleteCategory(id: string): Promise<void> {
  await requireAdmin();

  if (!adminResourceIdSchema.safeParse(id).success) return;

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`deleteCategory: failed to delete category "${id}"`, error);
    throw new Error("Failed to delete category");
  }
  if (deleted.length === 0) return;

  revalidatePath("/", "layout");
}
