import { createClient } from "@/lib/supabase/server";

import type { Category } from "./types";

// categories has no is_active concept in the schema — RLS already allows
// public select on every row, so this returns the full list as-is.
export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .order("name", { ascending: true });

  if (error) {
    console.error("getCategories: failed to load categories", error);
    return [];
  }

  return data;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`getCategoryBySlug: failed to load category "${slug}"`, error);
    return null;
  }

  return data;
}
