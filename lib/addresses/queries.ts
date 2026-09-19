import { cache } from "react";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type Address = {
  id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
};

const ADDRESS_SELECT =
  "id, full_name, phone, line1, line2, city, state, postal_code, country, is_default";

// RLS (addresses_owner_only) already scopes every row to auth.uid(), but
// this explicit .eq is the same defense-in-depth the cart/wishlist queries
// already apply on top of RLS elsewhere in this codebase.
export const getAddresses = cache(async (): Promise<Address[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("addresses")
    .select(ADDRESS_SELECT)
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`getAddresses: failed to load addresses for user "${user.id}"`, error);
    throw new Error("Failed to load addresses");
  }

  return data;
});

export const getAddressById = cache(
  async (id: string): Promise<Address | null> => {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("addresses")
      .select(ADDRESS_SELECT)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(`getAddressById: failed to load address "${id}"`, error);
      throw new Error("Failed to load address");
    }

    return data;
  },
);
