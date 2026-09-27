import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
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
      <AdminPageHeader
        description={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
      >
        Orders
      </AdminPageHeader>

      {orders.length === 0 ? (
        <EmptyState message="No orders yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-stack">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th className="cell-num">Items</th>
                <th className="cell-num">Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}>
                  <td className="font-mono text-xs">
                    #{order.id.slice(0, 8)}
                  </td>
                  <td data-label="Customer" className="[overflow-wrap:anywhere]">{order.customerName}</td>
                  <td data-label="Date" className="text-muted tabular-nums">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td data-label="Items" className="cell-num">{order.itemCount}</td>
                  <td data-label="Total" className="cell-num font-medium">{formatPrice(order.total)}</td>
                  <td data-label="Status">
                    <span
                      className={`capitalize ${orderStatusBadgeClass(order.status)}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <Link href={`/admin/orders/${order.id}`} className="btn btn-secondary btn-sm">
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
