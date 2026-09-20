import { cache } from "react";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type OrderShippingAddress = {
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
};

export type OrderListItem = {
  id: string;
  status: string;
  total: string;
  created_at: string;
  itemCount: number;
};

export type OrderDetailItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: string;
  quantity: number;
  subtotal: string;
};

export type OrderDetail = {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  shipping_address: OrderShippingAddress;
  created_at: string;
  items: OrderDetailItem[];
};

// RLS (orders_select_own_or_admin / order_items_select_via_order) already
// scopes both queries below to their owner (or an admin), but the explicit
// .eq is the same defense-in-depth every other owner-scoped query in this
// codebase applies on top of RLS.

export const getOrders = cache(async (): Promise<OrderListItem[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, total, created_at, items:order_items(quantity)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`getOrders: failed to load orders for user "${user.id}"`, error);
    throw new Error("Failed to load orders");
  }

  return data.map(({ items, ...order }) => ({
    ...order,
    itemCount: (items as unknown as { quantity: number }[]).reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
  }));
});

const ORDER_DETAIL_SELECT =
  "id, status, subtotal, total, shipping_address, created_at, items:order_items(id, product_id, product_name, unit_price, quantity, subtotal)";

export const getOrderById = cache(
  async (orderId: string): Promise<OrderDetail | null> => {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(`getOrderById: failed to load order "${orderId}"`, error);
      throw new Error("Failed to load order");
    }

    if (!data) return null;

    // shipping_address is stored as jsonb with no generated Database types
    // to describe its shape, so postgrest-js infers it as generic Json —
    // this is the checkout-time snapshot place_order() wrote, never a live
    // reference to the addresses table (see supabase/schema.sql), which is
    // exactly why it's still correct even if the address was since edited
    // or deleted.
    return {
      ...data,
      shipping_address: data.shipping_address as unknown as OrderShippingAddress,
    };
  },
);
