"use client";

import { useActionState } from "react";

import { updateOrderStatus } from "@/lib/admin/orders";
import { ORDER_STATUSES } from "@/lib/admin/schemas";

export function OrderStatusForm({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateOrderStatus.bind(null, orderId),
    undefined,
  );
  const isCancelled = status === "cancelled";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={status}
          disabled={pending || isCancelled}
          aria-label="Order status"
          className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-foreground/50 disabled:opacity-60 dark:border-white/20"
        >
          {isCancelled && <option value="cancelled">Cancelled</option>}
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || isCancelled}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-60 dark:border-white/20"
        >
          {pending ? "Updating…" : "Update status"}
        </button>
      </div>
      {isCancelled && (
        <p className="text-xs text-foreground/60">
          This order is cancelled and can no longer change status.
        </p>
      )}
      {state && "error" in state && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state && "success" in state && (
        <p className="text-sm text-green-600">Status updated.</p>
      )}
    </form>
  );
}
