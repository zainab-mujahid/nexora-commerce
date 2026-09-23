import { cache } from "react";
import * as z from "zod";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type OrderShippingAddress = {
  full_name: string;
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

// orderId comes straight from the URL. Postgres rejects a non-UUID string
// for a uuid column with an error (not an empty result), which the by-id
// lookups below would surface as a 500 — so a malformed id is answered the
// same way as a well-formed id that matches nothing (null -> the page's
// notFound()), without ever reaching the database. Same z.uuid() check
// lib/admin/schemas.ts already applies to orderId in admin actions.
const orderIdSchema = z.uuid();

export const getOrderById = cache(
  async (orderId: string): Promise<OrderDetail | null> => {
    const user = await requireUser();
    if (!orderIdSchema.safeParse(orderId).success) return null;

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

// ---- Admin reads (Step 18) ----
// No user_id filter on either query: RLS's is_admin() (orders_select_own_or_admin
// / order_items_select_via_order) is what makes this safe — a non-admin session
// querying the same way would only ever get its own rows back, same as the
// admin reads in lib/catalog/products.ts.

export type AdminOrderListItem = OrderListItem & {
  // The checkout-time shipping-name snapshot, not the account holder's
  // profile name — an order has no separate "billing contact" concept in
  // this schema, and the recipient name is what an admin needs to
  // recognize the order by.
  customerName: string;
};

export const getAdminOrders = cache(async (): Promise<AdminOrderListItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, total, created_at, shipping_address, items:order_items(quantity)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAdminOrders: failed to load orders", error);
    throw new Error("Failed to load orders");
  }

  return data.map(({ items, shipping_address, ...order }) => ({
    ...order,
    itemCount: (items as unknown as { quantity: number }[]).reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    customerName: (shipping_address as unknown as OrderShippingAddress).full_name,
  }));
});

export const getAdminOrderById = cache(
  async (orderId: string): Promise<OrderDetail | null> => {
    // See orderIdSchema above — same malformed-URL-id -> not-found handling.
    if (!orderIdSchema.safeParse(orderId).success) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error(`getAdminOrderById: failed to load order "${orderId}"`, error);
      throw new Error("Failed to load order");
    }

    if (!data) return null;

    return {
      ...data,
      shipping_address: data.shipping_address as unknown as OrderShippingAddress,
    };
  },
);
