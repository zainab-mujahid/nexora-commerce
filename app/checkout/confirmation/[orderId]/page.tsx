import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatPhoneNumber } from "@/lib/addresses/format";
import { requireUser } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getOrderConfirmation } from "@/lib/checkout/queries";

export const metadata: Metadata = {
  title: "Order confirmation",
};

export default async function OrderConfirmationPage({
  params,
}: PageProps<"/checkout/confirmation/[orderId]">) {
  await requireUser();
  const { orderId } = await params;

  const order = await getOrderConfirmation(orderId);
  if (!order) notFound();

  const address = order.shipping_address;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Order placed</h1>
        <p className="text-sm text-foreground/60">
          Thanks for your order — we&apos;ll get it ready. This order is unpaid pending
          payment integration; no payment has been charged.
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-black/10 p-4 text-sm dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Order ID</span>
          <span className="font-mono text-xs text-foreground/60">{order.id}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Status</span>
          <span className="capitalize">{order.status}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Placed on</span>
          <span>{new Date(order.created_at).toLocaleString()}</span>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-black/10 p-4 text-sm dark:border-white/10">
        <h2 className="font-medium">Shipping address</h2>
        <p>{address.full_name}</p>
        <p className="text-foreground/70">{formatPhoneNumber(address.phone)}</p>
        <p className="text-foreground/70">
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}
        </p>
        <p className="text-foreground/70">
          {address.city}
          {address.state ? `, ${address.state}` : ""} {address.postal_code}
        </p>
        <p className="text-foreground/70">{address.country}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Items</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-md border border-black/10 p-3 text-sm dark:border-white/10"
            >
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-foreground/60">
                  {formatPrice(item.unit_price)} &times; {item.quantity}
                </p>
              </div>
              <p className="font-medium">{formatPrice(item.subtotal)}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 border-t border-black/10 pt-3 dark:border-white/10">
          <div className="flex items-center justify-between text-sm text-foreground/60">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>

      <Link href="/products" className="self-start text-sm font-medium hover:opacity-70">
        Continue shopping
      </Link>
    </main>
  );
}
