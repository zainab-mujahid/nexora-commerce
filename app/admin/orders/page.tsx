import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { formatPrice } from "@/lib/catalog/format";
import { getAdminOrders } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Orders",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-foreground/10 text-foreground/70",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  shipped: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      {orders.length === 0 ? (
        <EmptyState message="No orders yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-foreground/60 dark:border-white/10">
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Items</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-4 font-mono text-xs text-foreground/60">
                    {order.id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{order.customerName}</td>
                  <td className="py-2 pr-4 text-foreground/60">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4">{order.itemCount}</td>
                  <td className="py-2 pr-4">{formatPrice(order.total)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[order.status] ?? ""}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/orders/${order.id}`} className="hover:opacity-70">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
