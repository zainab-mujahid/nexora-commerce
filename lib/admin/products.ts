"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import {
  getProductEmbeddingStatuses,
  summarizeProductEmbeddingStatuses,
  type ProductEmbeddingStatus,
} from "@/lib/ai/product-embedding-status";
import { ensureProductEmbeddingCurrent } from "@/lib/ai/product-embeddings";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/ai/retry";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { adminResourceIdSchema, productSchema, type ProductFormState } from "./schemas";

// Postgres unique_violation — raised by the `products.slug` unique
// constraint when a slug collides with an existing row.
const UNIQUE_VIOLATION = "23505";

const PRODUCT_NOT_FOUND_MESSAGE = "This product no longer exists.";

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
  // what happens next. ensureProductEmbeddingCurrent() never throws; on
  // failure the embedding stays NULL and the failure time is recorded, so
  // this is safe to await without any try/catch of its own here.
  await ensureProductEmbeddingCurrent(created.id);

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

  // Regenerates only when the embedding no longer matches the saved
  // name/description/category (compared by source hash) — a slug, price,
  // stock or is_active change leaves the hash equal and makes no Gemini
  // call. The update above has already committed successfully by this
  // point: ensureProductEmbeddingCurrent() never throws, and on failure
  // leaves the previous embedding and hash exactly as they were (recording
  // the failure) — it never rolls back or blocks this otherwise-valid edit.
  await ensureProductEmbeddingCurrent(id);

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

// ---- Per-product search-index repair ----
// Makes ONE product's embedding match its current name/description/category
// by delegating to ensureProductEmbeddingCurrent(), which owns the source
// text, category lookup, hash, Gemini call, failure recording and guarded
// write. Only the product id comes from the browser: whether a repair is
// needed is re-decided on the server at execution time (a status shown
// earlier may already be stale), so a product that is already current costs
// no Gemini call and no write. Never throws a provider/database error to
// the client — every outcome is one of the results below.
export type RepairProductEmbeddingResult =
  | { status: "repaired"; message: string }
  | { status: "already_current"; message: string }
  | { status: "failed"; message: string }
  | { status: "superseded"; message: string }
  | { status: "not_found"; message: string };

export async function repairProductEmbedding(
  productId: string,
): Promise<RepairProductEmbeddingResult> {
  await requireAdmin();

  if (!adminResourceIdSchema.safeParse(productId).success) {
    return { status: "not_found", message: PRODUCT_NOT_FOUND_MESSAGE };
  }

  const { status } = await ensureProductEmbeddingCurrent(productId);

  switch (status) {
    case "current":
      return { status: "already_current", message: "Search index is already up to date." };
    case "updated":
      // Only the admin list shows index status; storefront search reads
      // embeddings per request, so nothing else needs refreshing.
      revalidatePath("/admin/products");
      return { status: "repaired", message: "Search index updated." };
    case "failed":
      // A failed attempt records embedding_failed_at, which changes the
      // status the admin list shows.
      revalidatePath("/admin/products");
      return {
        status: "failed",
        message: "Couldn't update the search index. Please try again later.",
      };
    case "superseded":
      return {
        status: "superseded",
        message: "This product changed while its search index was being updated. Refresh and try again if it still needs it.",
      };
    case "not_found":
      return { status: "not_found", message: PRODUCT_NOT_FOUND_MESSAGE };
  }
}

// ---- Bulk search-index repair (maintenance) ----
// One bounded, admin-triggered run over the products whose search index
// needs attention (missing, out of date, repair failed), chosen on the
// server from the canonical statuses at the start of the run — nothing
// about which products, how many, or their state comes from the browser.
// Each product goes through ensureProductEmbeddingCurrent() — the same
// source text, hash, category handling, failure recording and guarded
// write as a single repair — one at a time, and each commits on its own, so
// one failure never undoes another product's repair. Safe to run
// repeatedly: a product that is already current costs no Gemini call.
const REPAIR_RUN_MAX_PRODUCTS = 10;
// Checked before starting each product, and also bounds the embedding
// request in flight: each product's Gemini request gets an abort signal
// that fires when the run's time is up, which cancels the real HTTP request
// (the product then fails like any other failed generation — recorded, old
// embedding and hash kept). Database reads/writes around it are not cut
// off, so a run can still end a few round trips past this.
const REPAIR_RUN_TIME_BUDGET_MS = 20_000;
const REPAIR_RUN_MAX_CONSECUTIVE_FAILURES = 3;
// At most this many Gemini embedding requests per run, retries included
// (counted at the real request boundary). A product is only started while
// its worst case — withAiRetry's maximum attempts — still fits, so a run
// never exceeds this and never stops a product halfway.
const REPAIR_RUN_MAX_PROVIDER_REQUESTS = 15;
// A product whose repair failed within this window is moved behind every
// other candidate (still attempted if the run gets that far): a product
// that keeps failing must not take the front of every run and stop it
// before other products get a chance.
const REPAIR_RUN_FAILURE_COOLDOWN_MS = 30 * 60_000;

// Customer-visible (active) products first; within each, no embedding at
// all before a failed repair before an out-of-date one. Up-to-date products
// are never candidates.
const REPAIR_PRIORITY: Record<ProductEmbeddingStatus, number | null> = {
  missing: 0,
  repair_failed: 1,
  out_of_date: 2,
  up_to_date: null,
};

type RepairRunStopReason =
  | "complete"
  | "batch_limit"
  | "time_budget"
  | "consecutive_failures"
  | "provider_budget";

// completed:
// - processed: products this run handed to ensureProductEmbeddingCurrent()
//   (at most REPAIR_RUN_MAX_PRODUCTS) = repaired + alreadyCurrent + failed
//   + superseded + notFound.
// - alreadyCurrent / notFound: had become current, or been deleted, by the
//   time they were reached (a concurrent save or repair) — no Gemini call.
// - superseded: the product or its category changed while its embedding
//   was being generated, so nothing was written for it.
// - skippedUnresolved: status couldn't be determined; never processed.
// - remaining: products still needing attention after the run, re-read
//   from the canonical statuses (null if that re-read failed).
// - stoppedReason: complete (no candidates left), or why it stopped early.
//   Products left unprocessed are not failures.
// unavailable: the statuses couldn't be read, so nothing was processed.
export type RepairProductSearchIndexResult =
  | {
      status: "completed";
      processed: number;
      repaired: number;
      alreadyCurrent: number;
      failed: number;
      superseded: number;
      notFound: number;
      skippedUnresolved: number;
      remaining: number | null;
      stoppedReason: RepairRunStopReason;
      message: string;
    }
  | { status: "unavailable"; message: string };

// Uses ensureProductEmbeddingCurrent() directly rather than
// repairProductEmbedding(): this action has already checked admin access
// once, and revalidates once at the end, instead of per product.
export async function repairProductSearchIndex(): Promise<RepairProductSearchIndexResult> {
  await requireAdmin();

  const before = await getProductEmbeddingStatuses();
  if (!before.ok) {
    return {
      status: "unavailable",
      message: "Couldn't read the search index status. Please try again.",
    };
  }

  let skippedUnresolved = 0;
  const now = Date.now();
  const candidates: {
    id: string;
    rank: number;
    createdAt: string;
    recentFailure: string | null;
  }[] = [];
  for (const [id, entry] of before.statuses) {
    if (entry.status === null) {
      skippedUnresolved++;
      continue;
    }
    const priority = REPAIR_PRIORITY[entry.status];
    if (priority === null) continue;
    const failedAtMs = entry.failedAt === null ? NaN : Date.parse(entry.failedAt);
    candidates.push({
      id,
      rank: (entry.isActive ? 0 : 3) + priority,
      createdAt: entry.createdAt,
      recentFailure:
        now - failedAtMs < REPAIR_RUN_FAILURE_COOLDOWN_MS ? entry.failedAt : null,
    });
  }
  // Products with no recent failure first, in priority bucket, then oldest
  // first, then id; recently failed ones after all of them, in priority
  // bucket, then oldest failure first, then id — fully deterministic.
  // Timestamps are ISO strings, so string order is time order.
  const byString = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  candidates.sort(
    (a, b) =>
      Number(a.recentFailure !== null) - Number(b.recentFailure !== null) ||
      a.rank - b.rank ||
      (a.recentFailure !== null && b.recentFailure !== null
        ? byString(a.recentFailure, b.recentFailure)
        : byString(a.createdAt, b.createdAt)) ||
      byString(a.id, b.id),
  );

  const startedAt = performance.now();
  let processed = 0;
  let repaired = 0;
  let alreadyCurrent = 0;
  let failed = 0;
  let superseded = 0;
  let notFound = 0;
  // `failed` from ensure covers the embedding provider AND the database
  // reads/writes around it (including the category lookup) — it doesn't
  // say which. Every `failed` counts here: stopping early on repeated
  // database trouble is as sensible as on provider trouble. Any other
  // outcome breaks the streak.
  let consecutiveFailures = 0;
  let providerRequests = 0;
  let stoppedReason: RepairRunStopReason = "complete";

  for (const candidate of candidates) {
    if (processed >= REPAIR_RUN_MAX_PRODUCTS) {
      stoppedReason = "batch_limit";
      break;
    }
    if (consecutiveFailures >= REPAIR_RUN_MAX_CONSECUTIVE_FAILURES) {
      stoppedReason = "consecutive_failures";
      break;
    }
    const remainingMs = REPAIR_RUN_TIME_BUDGET_MS - (performance.now() - startedAt);
    if (remainingMs <= 0) {
      stoppedReason = "time_budget";
      break;
    }
    if (providerRequests + DEFAULT_MAX_ATTEMPTS > REPAIR_RUN_MAX_PROVIDER_REQUESTS) {
      stoppedReason = "provider_budget";
      break;
    }

    processed++;
    const { status } = await ensureProductEmbeddingCurrent(candidate.id, {
      signal: AbortSignal.timeout(Math.ceil(remainingMs)),
      onProviderRequest: () => {
        providerRequests++;
      },
    });
    if (status === "failed") {
      failed++;
      consecutiveFailures++;
      continue;
    }
    consecutiveFailures = 0;
    if (status === "updated") repaired++;
    else if (status === "current") alreadyCurrent++;
    else if (status === "superseded") superseded++;
    else notFound++;
  }

  // Re-derived after the run, so concurrent saves, repairs and category
  // changes are reflected — counting down from the candidates would not be.
  const after = await getProductEmbeddingStatuses();
  const remaining = after.ok
    ? summarizeProductEmbeddingStatuses(after.statuses).needsAttention
    : null;

  // Repairs and recorded failures (embedding_failed_at) both change the
  // search-index status the admin product list shows; storefront search
  // reads embeddings per request and needs no revalidation.
  if (repaired > 0 || failed > 0) revalidatePath("/admin/products");

  return {
    status: "completed",
    processed,
    repaired,
    alreadyCurrent,
    failed,
    superseded,
    notFound,
    skippedUnresolved,
    remaining,
    stoppedReason,
    message: repairRunMessage({ processed, repaired, failed, superseded, skippedUnresolved, remaining, stoppedReason }),
  };
}

function repairRunMessage(run: {
  processed: number;
  repaired: number;
  failed: number;
  superseded: number;
  skippedUnresolved: number;
  remaining: number | null;
  stoppedReason: RepairRunStopReason;
}): string {
  const sentences: string[] = [];
  if (run.processed === 0) {
    sentences.push("No products needed repair.");
  } else {
    const parts = [`${run.repaired} repaired`];
    if (run.failed > 0) parts.push(`${run.failed} failed`);
    if (run.superseded > 0) parts.push(`${run.superseded} changed during the run`);
    sentences.push(`Search index repair: ${parts.join(", ")}.`);
  }
  if (run.stoppedReason === "consecutive_failures") {
    sentences.push("Stopped after repeated failures. Please try again later.");
  } else if (run.stoppedReason !== "complete") {
    sentences.push("Run again to continue.");
  }
  if (run.skippedUnresolved > 0) {
    sentences.push(`${run.skippedUnresolved} product(s) couldn't be checked.`);
  }
  sentences.push(
    run.remaining === null
      ? "Couldn't re-check the remaining count."
      : `${run.remaining} product(s) still need attention.`,
  );
  return sentences.join(" ");
}
