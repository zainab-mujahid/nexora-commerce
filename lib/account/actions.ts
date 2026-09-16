"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { updateProfileSchema, type UpdateProfileState } from "./schemas";

export async function updateProfile(
  _state: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  // Server Actions are reachable by direct POST, not only through this
  // rendered form, so the session must be re-verified here rather than
  // trusting that only an authenticated page could have called it.
  const user = await requireUser();

  const validatedFields = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();
  // Only full_name is ever read from the form and written here — role is
  // never accepted from client input, so there is nothing for a tampered
  // request to smuggle through even before RLS's own check runs.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: validatedFields.data.fullName })
    .eq("id", user.id);

  if (error) {
    console.error(`updateProfile: failed to update profile for user ${user.id}`, error);
    return { message: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath("/", "layout");
  return { message: "Profile updated.", success: true };
}
