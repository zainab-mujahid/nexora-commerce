import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth/dal";
import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { formatPrice } from "@/lib/catalog/format";
import { getOrderById } from "@/lib/orders/queries";

import { PlacedBanner } from "./placed-banner";

export const metadata: Metadata = {
  title: "Order details",
};

export default async function OrderDetailPage({
  params,
}: PageProps<"/orders/[id]">) {
  await requireUser();
  const { id } = await params;

  const order = await getOrderById(id);
  if (!order) notFound();

  const address = order.shipping_address;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-1">
        <Link href="/orders" className="link-action self-start text-sm">
          &larr; Orders
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Order details</h1>
        <Suspense fallback={null}>
          <PlacedBanner />
        </Suspense>
      </div>

      <section className="flex flex-col gap-2 card p-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Order ID</span>
          <span className="font-mono text-xs text-muted">{order.id}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Status</span>
          <span className={`capitalize ${orderStatusBadgeClass(order.status)}`}>{order.status}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Placed on</span>
          <span>{new Date(order.created_at).toLocaleString()}</span>
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

      <Link href="/products" className="link-action self-start text-sm">
        Continue shopping
      </Link>
    </main>
  );
}
