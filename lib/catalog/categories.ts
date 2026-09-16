import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { Category } from "./types";

// A genuine query failure is thrown, not swallowed: callers are Server
// Components (Step 6 pages), and throwing lets Next's nearest error.tsx
// boundary handle it, matching how the storefront is required to show a
// real error state distinct from "no categories yet" (a legitimate empty
// array, not an error).

// categories has no is_active concept in the schema — RLS already allows
// public select on every row, so this returns the full list as-is.
export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .order("name", { ascending: true });

  if (error) {
    console.error("getCategories: failed to load categories", error);
    throw new Error("Failed to load categories");
  }

  return data;
});

export const getCategoryBySlug = cache(
  async (slug: string): Promise<Category | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error(`getCategoryBySlug: failed to load category "${slug}"`, error);
      throw new Error("Failed to load category");
    }

    return data;
  },
);
