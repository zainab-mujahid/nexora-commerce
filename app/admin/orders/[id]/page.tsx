import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { formatPrice } from "@/lib/catalog/format";
import { paymentStatusBadgeClass, paymentStatusLabel, providerStateLabel } from "@/lib/admin/payment-presentation";
import { getAdminOrderPayment } from "@/lib/admin/payment-queries";
import { getAdminOrderById } from "@/lib/orders/queries";

import { CancelOrderButton } from "../cancel-order-button";
import { OrderStatusForm } from "../order-status-form";

export const metadata: Metadata = {
  title: "Order details",
};

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await getAdminOrderById(id);
  if (!order) notFound();

  const address = order.shipping_address;
  const payment = order.payment_status === "not_collected" ? null : await getAdminOrderPayment(order.id);

  // Item names/prices are order_items snapshots and the address is the
  // orders.shipping_address snapshot — the order as it was placed.
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        description={<span className="font-mono text-xs">{order.id}</span>}
        action={
          <span className={`capitalize ${orderStatusBadgeClass(order.status)} px-3 py-1 text-sm`}>
            {order.status}
          </span>
        }
      >
        Order details
      </AdminPageHeader>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="admin-order-items" className="card flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="admin-order-items" className="text-base font-semibold">Items</h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 py-3 text-sm"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-medium [overflow-wrap:anywhere]">{item.product_name}</p>
                  <p className="text-muted tabular-nums">
                    {formatPrice(item.unit_price)} &times; {item.quantity}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">{formatPrice(item.subtotal)}</p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="text-xl tracking-tight tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="admin-order-status" className="card flex flex-col gap-4 p-5 text-sm">
            <h2 id="admin-order-status" className="text-base font-semibold">Status</h2>
            <OrderStatusForm orderId={order.id} status={order.status} />
            <div className="border-t border-border pt-4">
              <CancelOrderButton orderId={order.id} status={order.status} paidOnline={order.payment_status !== "not_collected"} />
            </div>
          </section>

          <section aria-labelledby="admin-order-payment" className="card flex flex-col gap-2 p-5 text-sm">
            <h2 id="admin-order-payment" className="text-base font-semibold">Payment</h2>
            {payment ? (
              <>
                <p className="flex flex-wrap items-center gap-2">
                  <span className={paymentStatusBadgeClass(order.payment_status)}>{paymentStatusLabel(order.payment_status)}</span>
                  {payment.providerState && providerStateLabel(payment.providerState) !== paymentStatusLabel(order.payment_status) && (
                    <span className="text-xs text-muted">Provider: {providerStateLabel(payment.providerState)}</span>
                  )}
                </p>
                <Link href={`/admin/payments/${payment.id}`} className="link-action self-start text-sm">
                  View payment
                </Link>
              </>
            ) : (
              <p className="text-muted">No online payment recorded.</p>
            )}
          </section>

          <section className="card flex flex-col gap-1 p-5 text-sm">
            <p className="text-muted">Placed on</p>
            <p className="tabular-nums">{new Date(order.created_at).toLocaleString()}</p>
          </section>

          <section aria-labelledby="admin-order-address" className="card flex flex-col gap-1 p-5 text-sm [overflow-wrap:anywhere]">
            <h2 id="admin-order-address" className="mb-1 text-base font-semibold">Shipping address</h2>
            <p className="font-medium">{address.full_name}</p>
            <p className="text-muted">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </p>
            <p className="text-muted">
              {address.city}
              {address.state ? `, ${address.state}` : ""} {address.postal_code}
            </p>
            <p className="text-muted">{address.country}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
