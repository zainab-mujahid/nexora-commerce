"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { cancelOrderSchema, updateOrderStatusSchema } from "./schemas";

export type OrderActionState = { error: string } | { success: true } | undefined;

export async function updateOrderStatus(
  orderId: string,
  _prevState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  // Server Actions are reachable by direct POST, not only through this
  // form, so admin status is re-verified here regardless of what the page
  // (or app/admin/layout.tsx) already checked.
  await requireAdmin();

  const parsed = updateOrderStatusSchema.safeParse({
    orderId,
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: "Select a valid status." };
  }

  const supabase = await createClient();
  // .neq keeps 'cancelled' terminal: if the order is already cancelled this
  // matches zero rows instead of silently reviving it into a live status.
  const { data, error } = await supabase
    .from("orders")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.orderId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`updateOrderStatus: failed to update order "${orderId}"`, error);
    return { error: "Something went wrong. Please try again." };
  }
  if (!data) {
    return { error: "This order no longer exists or has already been cancelled." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: true };
}

// Cancellation is a separate, narrower action from updateOrderStatus above
// because it isn't a plain status write: it must also restore the stock
// place_order() decremented, so it goes through admin_cancel_order() (see
// supabase/schema.sql), one atomic transaction instead of two separate
// requests that could leave stock and status inconsistent with each other.
export async function cancelOrder(
  orderId: string,
  _prevState: OrderActionState,
  _formData: FormData,
): Promise<OrderActionState> {
  // Neither is used — cancelOrder needs no form fields beyond the bound
  // orderId — but both are required to match the (state, formData) shape
  // useActionState's dispatcher calls this with.
  void _prevState;
  void _formData;

  await requireAdmin();

  const parsed = cancelOrderSchema.safeParse({ orderId });
  if (!parsed.success) {
    return { error: "Invalid order." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_order", {
    p_order_id: parsed.data.orderId,
  });

  if (error) {
    if (error.message === "ORDER_NOT_CANCELLABLE") {
      return {
        error:
          "This order can no longer be cancelled — it has already shipped or been delivered.",
      };
    }
    if (error.message === "ORDER_NOT_FOUND") {
      return { error: "This order no longer exists." };
    }
    console.error(`cancelOrder: admin_cancel_order RPC failed for "${orderId}"`, error);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: true };
}
