"use client";

import { useActionState } from "react";

import { cancelOrder } from "@/lib/admin/orders";

const CANCELLABLE_STATUSES = new Set(["pending", "processing"]);

export function CancelOrderButton({
  orderId,
  status,
  paidOnline = false,
}: {
  orderId: string;
  status: string;
  // The order was paid online: cancelling (fulfilment + stock) does not
  // return the money — refunding is a separate step on the payment page.
  paidOnline?: boolean;
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
      {canCancel && paidOnline && (
        <p className="text-xs text-muted">
          Cancelling restores stock but doesn&apos;t refund the payment — refund it from the payment page afterwards if the customer should get it back.
        </p>
      )}
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
