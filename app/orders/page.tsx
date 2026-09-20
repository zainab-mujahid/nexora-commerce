import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getOrders } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function OrdersPage() {
  // getOrders() already gates on requireUser() — this repeats the check at
  // the page level too, the same defense-in-depth convention app/cart/page.tsx
  // and app/account/addresses/page.tsx follow.
  await requireUser();

  const orders = await getOrders();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-foreground/60">Your past orders and their status.</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState message="You haven't placed any orders yet." />
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex flex-col gap-2 rounded-md border border-black/10 p-4 text-sm hover:border-foreground/30 dark:border-white/10"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">
                    Order #{order.id.slice(0, 8)}
                  </span>
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium capitalize text-foreground/70">
                    {order.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-foreground/60">
                  <span>{new Date(order.created_at).toLocaleDateString()}</span>
                  <span>
                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"} &middot;{" "}
                    {formatPrice(order.total)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
