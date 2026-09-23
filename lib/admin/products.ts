"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { generateAndStoreProductEmbedding } from "@/lib/ai/product-embeddings";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { adminResourceIdSchema, productSchema, type ProductFormState } from "./schemas";

// Postgres unique_violation — raised by the `products.slug` unique
// constraint when a slug collides with an existing row.
const UNIQUE_VIOLATION = "23505";

const PRODUCT_NOT_FOUND_MESSAGE = "This product no longer exists.";

// Bounds a single backfillProductEmbeddings() call to a fixed batch instead
// of an unbounded "embed the entire catalog in one request" loop — safe at
// this project's current size, and still leaves a controlled, repeatable
// path (click again) rather than a dangerous pattern once the catalog
// grows. See backfillProductEmbeddings() below.
const EMBEDDING_BACKFILL_BATCH_LIMIT = 50;

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
  const { data: created, error } = await supabase
    .from("products")
    .insert({
      name,
      slug,
      description: description || null,
      price,
      stock,
      category_id: categoryId,
      is_active: parseIsActive(formData),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error("createProduct: failed to create product", error);
    return { message: "Something went wrong. Please try again." };
  }

  // AI failure must never break core product creation: the product row
  // above has already committed successfully by this point regardless of
  // what happens next. generateAndStoreProductEmbedding() never throws and
  // leaves embedding as its column default (NULL) on any failure, so this
  // is safe to await without any try/catch of its own here.
  await generateAndStoreProductEmbedding({
    id: created.id,
    name,
    description: description || null,
    categoryId,
  });

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

export async function updateProduct(
  id: string,
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  // Step 24A: `id` is a bound argument, so a crafted request can send
  // anything — a malformed value never reaches Postgres (see
  // adminResourceIdSchema in ./schemas).
  if (!adminResourceIdSchema.safeParse(id).success) {
    return { message: PRODUCT_NOT_FOUND_MESSAGE };
  }

  const validatedFields = parseProductFields(formData);
  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, slug, description, price, stock, categoryId } = validatedFields.data;
  const supabase = await createClient();

  // Read before write, solely to detect afterward whether a *semantic*
  // field (name/description/category) actually changed — never used to
  // block or alter the update itself. If this read fails, semanticFieldsChanged
  // below stays false: an inability to prove something changed must not be
  // treated as "it changed," so the safer default is to skip regeneration
  // rather than risk an unnecessary/incorrect embedding call.
  const { data: existingProduct, error: existingError } = await supabase
    .from("products")
    .select("name, description, category_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    console.error(
      `updateProduct: failed to load existing product "${id}" for embedding comparison`,
      existingError,
    );
  }

  // `.select("id")` returns the rows the UPDATE actually matched, so a
  // valid-but-nonexistent id (e.g. deleted in another tab) is detected from
  // this one statement instead of being reported as a successful save.
  const { data: updated, error } = await supabase
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
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { slug: ["This slug is already in use."] } };
    }
    console.error(`updateProduct: failed to update product "${id}"`, error);
    return { message: "Something went wrong. Please try again." };
  }
  if (updated.length === 0) {
    return { message: PRODUCT_NOT_FOUND_MESSAGE };
  }

  // Regenerate only on a real semantic change (name/description/category) —
  // never for price/stock/is_active, which are intentionally excluded from
  // embedding content entirely (see buildProductEmbeddingText). The update
  // above has already committed successfully by this point regardless of
  // what happens next: generateAndStoreProductEmbedding() never throws, and
  // on failure leaves the previous embedding (or NULL) exactly as it was —
  // it never rolls back or blocks this otherwise-valid edit.
  const semanticFieldsChanged =
    !existingError &&
    existingProduct !== null &&
    (existingProduct.name !== name ||
      (existingProduct.description ?? null) !== (description || null) ||
      existingProduct.category_id !== categoryId);

  if (semanticFieldsChanged) {
    await generateAndStoreProductEmbedding({
      id,
      name,
      description: description || null,
      categoryId,
    });
  }

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

// A quick activate/deactivate toggle from the product list, independent of
// the full edit form. It's bound directly to a plain <form action>, which
// must return void, so it reports nothing to the UI either way. Step 24A:
// both bound arguments are validated before any query (a malformed id or
// non-boolean flag used to reach Postgres and throw into the admin error
// page), and a valid id matching no row returns early without revalidating
// — neither case touches the database or claims a change.
export async function toggleProductActive(id: string, nextIsActive: boolean): Promise<void> {
  await requireAdmin();

  if (!adminResourceIdSchema.safeParse(id).success || typeof nextIsActive !== "boolean") {
    return;
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("products")
    .update({ is_active: nextIsActive })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`toggleProductActive: failed to update product "${id}"`, error);
    throw new Error("Failed to update product status");
  }
  if (updated.length === 0) {
    return;
  }

  revalidatePath("/", "layout");
}

// ---- Embedding backfill (Step 22 Phase 2) ----
// Admin-triggered, one bounded batch per invocation — never runs on app
// startup or as a side effect of ordinary browsing/admin traffic. Only ever
// touches products.embedding IS NULL rows, in strictly sequential order
// (awaiting each Gemini call before starting the next), so this can never
// fire uncontrolled parallel API calls. A single product's failure is
// caught inside generateAndStoreProductEmbedding() and only counted, never
// aborts the rest of the batch.
export type BackfillEmbeddingsState = { message: string } | undefined;

// No form fields to read (the trigger button has none), so this
// deliberately omits the `formData` parameter useActionState's action type
// otherwise expects — TypeScript allows assigning a function with fewer
// parameters to a function-typed slot that declares more.
export async function backfillProductEmbeddings(
  _prevState: BackfillEmbeddingsState,
): Promise<BackfillEmbeddingsState> {
  await requireAdmin();

  const supabase = await createClient();

  const { data: pending, error: pendingError } = await supabase
    .from("products")
    .select("id, name, description, category_id")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(EMBEDDING_BACKFILL_BATCH_LIMIT);

  if (pendingError) {
    console.error("backfillProductEmbeddings: failed to load pending products", pendingError);
    return { message: "Failed to load products pending an embedding. Please try again." };
  }

  let succeeded = 0;
  let failed = 0;

  for (const product of pending) {
    const result = await generateAndStoreProductEmbedding({
      id: product.id,
      name: product.name,
      description: product.description,
      categoryId: product.category_id,
    });
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  const { count: remaining, error: remainingError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  if (remainingError) {
    console.error("backfillProductEmbeddings: failed to count remaining products", remainingError);
  }

  if (succeeded > 0) {
    revalidatePath("/", "layout");
  }

  if (pending.length === 0) {
    return { message: "No products are missing an embedding." };
  }

  return {
    message: `Processed ${pending.length} (${succeeded} succeeded, ${failed} failed). ${remaining ?? "unknown"} product(s) still need an embedding.`,
  };
}
