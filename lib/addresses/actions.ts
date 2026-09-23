"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { addressSchema, type AddressFormState } from "./schemas";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function parseAddressFields(formData: FormData) {
  return addressSchema.safeParse({
    fullName: formData.get("fullName"),
    line1: formData.get("line1"),
    line2: formData.get("line2"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country"),
  });
}

// Unchecked checkboxes are omitted from FormData entirely, so "isDefault"
// is only present (as "true", from the checkbox's own value) when checked.
function parseIsDefault(formData: FormData) {
  return formData.get("isDefault") === "true";
}

async function countAddresses(supabase: SupabaseServerClient, userId: string) {
  const { count, error } = await supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error(`countAddresses: failed to count addresses for user "${userId}"`, error);
    throw new Error("Failed to check existing addresses");
  }

  return count ?? 0;
}

// addresses_one_default_idx allows at most one is_default=true row per
// user — clearing any existing default before setting a new one avoids
// ever asking Postgres for two at once (same pattern as
// lib/admin/product-images.ts's setProductImagePrimary).
async function clearExistingDefault(supabase: SupabaseServerClient, userId: string) {
  const { error } = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  if (error) {
    console.error(`clearExistingDefault: failed to clear default address for user "${userId}"`, error);
    throw new Error("Failed to update default address");
  }
}

// Invariant: exactly one default address whenever at least one address
// exists, never zero. Two separate UPDATE calls (clear-old, set-new) can
// never be made a single atomic database transaction through PostgREST, so
// a request that fails between them — or any other historical edge case —
// could in principle leave a user with addresses but no default marked.
// Every mutating action below calls this first, so any such gap is closed
// out on the very next create/update/delete/set-default rather than
// persisting: the same fix-on-next-write self-healing approach already
// used for product_images.sort_order in lib/admin/product-images.ts,
// rather than a fix-on-every-read one (a Server Component read path
// shouldn't perform writes as a side effect, so this is never called from
// lib/addresses/queries.ts).
async function ensureDefaultAddress(supabase: SupabaseServerClient, userId: string) {
  const { data: currentDefault, error: currentDefaultError } = await supabase
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (currentDefaultError) {
    console.error(
      `ensureDefaultAddress: failed to check default address for user "${userId}"`,
      currentDefaultError,
    );
    throw new Error("Failed to check default address");
  }
  if (currentDefault) return;

  const { data: oldest, error: oldestError } = await supabase
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (oldestError) {
    console.error(
      `ensureDefaultAddress: failed to find an address to promote for user "${userId}"`,
      oldestError,
    );
    throw new Error("Failed to check default address");
  }
  // No addresses at all — having no default is valid in that case.
  if (!oldest) return;

  const { error: promoteError } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", oldest.id);

  if (promoteError) {
    console.error(
      `ensureDefaultAddress: failed to promote address "${oldest.id}" to default for user "${userId}"`,
      promoteError,
    );
    throw new Error("Failed to update default address");
  }
}

export async function createAddress(
  _state: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  // Server Actions are reachable by direct POST, not only through this
  // form, so the session must be re-verified here.
  const user = await requireUser();

  const validatedFields = parseAddressFields(formData);
  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();
  await ensureDefaultAddress(supabase, user.id);

  // A user's very first address becomes the default automatically,
  // regardless of the checkbox — there should never be zero default
  // addresses once at least one address exists.
  const isFirstAddress = (await countAddresses(supabase, user.id)) === 0;
  const shouldBeDefault = parseIsDefault(formData) || isFirstAddress;

  if (shouldBeDefault) {
    await clearExistingDefault(supabase, user.id);
  }

  const { fullName, line1, line2, city, state, postalCode, country } =
    validatedFields.data;
  const { error } = await supabase.from("addresses").insert({
    user_id: user.id,
    full_name: fullName,
    line1,
    line2: line2 || null,
    city,
    state: state || null,
    postal_code: postalCode,
    country,
    is_default: shouldBeDefault,
  });

  if (error) {
    console.error("createAddress: failed to create address", error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/account/addresses");
  redirect("/account/addresses");
}

export async function updateAddress(
  id: string,
  _state: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const user = await requireUser();

  const validatedFields = parseAddressFields(formData);
  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();

  // Ownership derived from the row itself, not trusted from the client
  // beyond "which address" — same id-addressed-mutation pattern used
  // throughout lib/admin and lib/cart.
  const { data: existing, error: existingError } = await supabase
    .from("addresses")
    .select("id, is_default")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error(`updateAddress: failed to look up address "${id}"`, existingError);
    return { message: "Something went wrong. Please try again." };
  }
  if (!existing) {
    return { message: "Address not found." };
  }

  await ensureDefaultAddress(supabase, user.id);

  // Editing the current default can never turn it off — that would leave
  // the user with addresses but no default. Ignore whatever the client
  // sent for the checkbox in that case; setting a *different* address as
  // default is the only way to change it (see setDefaultAddress).
  const shouldBeDefault = existing.is_default || parseIsDefault(formData);
  if (shouldBeDefault && !existing.is_default) {
    await clearExistingDefault(supabase, user.id);
  }

  const { fullName, line1, line2, city, state, postalCode, country } =
    validatedFields.data;
  const { error } = await supabase
    .from("addresses")
    .update({
      full_name: fullName,
      line1,
      line2: line2 || null,
      city,
      state: state || null,
      postal_code: postalCode,
      country,
      is_default: shouldBeDefault,
    })
    .eq("id", id);

  if (error) {
    console.error(`updateAddress: failed to update address "${id}"`, error);
    return { message: "Something went wrong. Please try again." };
  }

  revalidatePath("/account/addresses");
  redirect("/account/addresses");
}

export async function deleteAddress(id: string): Promise<void> {
  const user = await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(`deleteAddress: failed to delete address "${id}"`, error);
    throw new Error("Failed to delete address");
  }

  // Covers "the deleted address was the default and others remain" (this
  // promotes the oldest remaining one) and "the deleted address was the
  // last one" (no addresses left, so ensureDefaultAddress finds none to
  // promote and correctly leaves no default) with the same call — it never
  // needs to know which case it was in beforehand.
  await ensureDefaultAddress(supabase, user.id);

  revalidatePath("/account/addresses");
}

export async function setDefaultAddress(id: string): Promise<void> {
  const user = await requireUser();

  const supabase = await createClient();
  const { data: address, error: lookupError } = await supabase
    .from("addresses")
    .select("id, is_default")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error(`setDefaultAddress: failed to look up address "${id}"`, lookupError);
    throw new Error("Failed to set default address");
  }
  if (!address) {
    throw new Error("Address not found");
  }
  if (address.is_default) return;

  await clearExistingDefault(supabase, user.id);

  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", address.id);

  if (error) {
    console.error(`setDefaultAddress: failed to set address "${id}" as default`, error);
    throw new Error("Failed to set default address");
  }

  revalidatePath("/account/addresses");
}
