import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "customer" | "admin";
};

// getUser() re-validates the token with the Auth server, unlike getSession(),
// which trusts whatever is in the cookie. Authorization must never branch on
// the latter.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) redirect("/login");

  return user;
});

// Enrichment only — never the source of truth for "is this user logged in."
// A failed lookup here must not make an authenticated user look like a guest:
// callers that need to branch UI on auth state should check getUser()/session
// state directly, matching what proxy.ts already checks, and use this only for
// display details (name, role) with a graceful fallback when it's unavailable.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error(`getProfile: failed to load profile for user ${user.id}`, error);
    return null;
  }

  return data;
});

export const requireAdmin = cache(async () => {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return profile;
});
