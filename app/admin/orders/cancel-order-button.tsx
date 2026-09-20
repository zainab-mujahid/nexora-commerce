"use client";

import { useActionState } from "react";

import { cancelOrder } from "@/lib/admin/orders";

const CANCELLABLE_STATUSES = new Set(["pending", "processing"]);

export function CancelOrderButton({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelOrder.bind(null, orderId),
    undefined,
  );
  const canCancel = CANCELLABLE_STATUSES.has(status);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending || !canCancel}
        className="self-start rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:hover:bg-red-950"
      >
        {pending ? "Cancelling…" : "Cancel order"}
      </button>
      {!canCancel && (
        <p className="text-xs text-foreground/60">
          Only pending or processing orders can be cancelled.
        </p>
      )}
      {state && "error" in state && <p className="text-xs text-red-600">{state.error}</p>}
      {state && "success" in state && (
        <p className="text-xs text-green-600">Order cancelled and stock restored.</p>
      )}
    </form>
  );
}
