import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth/dal";
import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { formatPrice } from "@/lib/catalog/format";
import { TestModeBadge } from "@/app/_components/test-mode-badge";
import { getOrderById, getOrderPaymentMethod, getOrderRefundSummary, isOrderPaymentJustConfirmed } from "@/lib/orders/queries";
import { minorToUsdDecimal } from "@/lib/payments/money";
import { getPaymentAvailability } from "@/lib/payments/presentation";

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
  const paymentMethod = order.payment_status === "not_collected" ? null : await getOrderPaymentMethod(order.id);
  // "Payment received" only for an order whose own payment the server
  // verified as paid moments ago (database state, never the URL).
  const justPaid = order.payment_status === "paid" && (await isOrderPaymentJustConfirmed(order.id));
  // Verified amounts only (refunds the provider confirmed); never timings.
  const refunds =
    order.payment_status === "partially_refunded" || order.payment_status === "refunded" ? await getOrderRefundSummary(order.id) : null;
  const refundedText =
    refunds && BigInt(refunds.refundedMinor) > BigInt(0)
      ? `${formatPrice(minorToUsdDecimal(BigInt(refunds.refundedMinor)))} of ${formatPrice(minorToUsdDecimal(BigInt(refunds.paidMinor)))} refunded`
      : null;
  const availability = getPaymentAvailability();
  const testMode = order.payment_status !== "not_collected" && availability.available && availability.testMode;
  const paymentLabel: Record<typeof order.payment_status, string> = {
    paid: "Paid",
    partially_refunded: "Partially refunded",
    refunded: "Refunded",
    requires_review: "Under review",
    not_collected: "No online payment recorded",
  };
  // Only states the data model knows for certain; no amounts or timings that
  // the provider hasn't verified.
  const paymentNote: Partial<Record<typeof order.payment_status, string>> = {
    requires_review: "We're checking an update about this payment with our payment provider. You don't need to do anything right now.",
    partially_refunded: "Part of this payment has been refunded.",
    refunded: "This payment has been refunded.",
  };

  // Everything below is the order's own recorded data: item names and prices
  // are order_items snapshots and the address is the orders.shipping_address
  // snapshot — never the current product or saved-address values.
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/orders" className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
          <span aria-hidden="true">&larr;</span> Back to orders
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="display-title text-3xl sm:text-4xl">Order details</h1>
            <p className="text-sm text-muted">
              Order #{order.id.slice(0, 8)} &middot;{" "}
              <span className="tabular-nums">{new Date(order.created_at).toLocaleDateString()}</span>
            </p>
          </div>
          <span className={`capitalize ${orderStatusBadgeClass(order.status)} px-3 py-1 text-sm`}>
            {order.status}
          </span>
        </div>
        <Suspense fallback={null}>
          <PlacedBanner confirmed={justPaid} />
        </Suspense>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="order-items-heading" className="card flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="order-items-heading" className="text-lg font-semibold tracking-tight">Items</h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 py-3.5 text-sm"
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
          <section className="card p-5 text-sm">
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <dt className="text-muted">Order ID</dt>
                <dd className="font-mono text-xs [overflow-wrap:anywhere]">{order.id}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted">Placed on</dt>
                <dd className="tabular-nums">{new Date(order.created_at).toLocaleString()}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted">Payment</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span>
                    {paymentLabel[order.payment_status]}
                    {paymentMethod && (
                      <span className="text-muted">
                        {" · "}
                        {paymentMethod.brand ?? "Card"}
                        {paymentMethod.last4 ? ` •••• ${paymentMethod.last4}` : ""}
                      </span>
                    )}
                  </span>
                  {testMode && <TestModeBadge />}
                </dd>
                {refundedText && <dd className="text-sm tabular-nums">{refundedText}</dd>}
                {paymentNote[order.payment_status] && (
                  <dd className="text-xs leading-relaxed text-muted">{paymentNote[order.payment_status]}</dd>
                )}
              </div>
            </dl>
          </section>

          <section aria-labelledby="order-address-heading" className="card flex flex-col gap-2 p-5 text-sm [overflow-wrap:anywhere]">
            <h2 id="order-address-heading" className="mb-1 text-sm font-semibold">Shipping address</h2>
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

      <Link href="/products" className="link-action self-start text-sm">
        Continue shopping
      </Link>
    </div>
  );
}
