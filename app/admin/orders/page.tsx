import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { formatPrice } from "@/lib/catalog/format";
import { getAdminOrders } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      {orders.length === 0 ? (
        <EmptyState message="No orders yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}>
                  <td className="font-mono text-xs text-muted">
                    {order.id.slice(0, 8)}
                  </td>
                  <td>{order.customerName}</td>
                  <td className="text-muted">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td>{order.itemCount}</td>
                  <td>{formatPrice(order.total)}</td>
                  <td>
                    <span
                      className={`capitalize ${orderStatusBadgeClass(order.status)}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/orders/${order.id}`} className="link-action">
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
