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
        className="btn btn-danger self-start"
      >
        {pending ? "Cancelling…" : "Cancel order"}
      </button>
      {!canCancel && (
        <p className="text-xs text-muted">
          Only pending or processing orders can be cancelled.
        </p>
      )}
      {state && "error" in state && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state && "success" in state && (
        <p className="text-xs text-success">Order cancelled and stock restored.</p>
      )}
    </form>
  );
}
