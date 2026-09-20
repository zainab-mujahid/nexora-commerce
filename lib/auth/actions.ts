"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";

import { createClient } from "@/lib/supabase/server";

import { loginSchema, signupSchema, type AuthFormState } from "./schemas";

// A `next` value arrives from the query string, so it is attacker-controlled.
// Anything other than a single-slash relative path could send the user to
// another origin after login — a classic post-login open-redirect used for
// phishing (the victim sees this app's real login page and enters real
// credentials, then lands on an attacker-controlled page).
//
// A naive `startsWith("/") && !startsWith("//")` check is not enough:
// browsers treat "\" as equivalent to "/" when parsing a URL for a special
// scheme (http/https), and they strip stray tab/newline/CR characters from
// a URL wherever those occur before parsing it (WHATWG URL Standard). That
// means "/\evil.com" and "/\t/evil.com" both resolve to the protocol-relative
// "//evil.com" in the browser despite passing a check that only looks at
// literal leading slashes.
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";

  const stripped = value.replace(/[\t\r\n]/g, "");
  if (!/^[/\\](?![/\\])/.test(stripped)) return "/";

  return stripped;
}

export async function signup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validatedFields = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { fullName, email, password } = validatedFields.data;
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  });

  if (error) {
    return { message: error.message };
  }

  // No session means the project requires email confirmation first.
  if (!data.session) {
    return {
      message: `We sent a confirmation link to ${email}. Open it to finish creating your account.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function login(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validatedFields = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(
    validatedFields.data,
  );

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectTarget(formData.get("next")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
