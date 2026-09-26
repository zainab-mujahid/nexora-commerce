import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatPrice } from "@/lib/catalog/format";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Order details</h1>
        <p className="font-mono text-xs text-muted">{order.id}</p>
      </div>

      <section className="flex flex-col gap-3 card p-4 text-sm">
        <h2 className="text-sm font-semibold">Status</h2>
        <OrderStatusForm orderId={order.id} status={order.status} />
        <div className="border-t border-border pt-3">
          <CancelOrderButton orderId={order.id} status={order.status} />
        </div>
      </section>

      <section className="flex flex-col gap-2 card p-4 text-sm">
        <h2 className="text-sm font-semibold">Shipping address</h2>
        <p>{address.full_name}</p>
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Items</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 card p-3 text-sm"
            >
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-muted">
                  {formatPrice(item.unit_price)} &times; {item.quantity}
                </p>
              </div>
              <p className="font-medium">{formatPrice(item.subtotal)}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
