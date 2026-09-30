import Link from "next/link";
import type { Metadata } from "next";

import { ShoppingEmptyState } from "@/app/_components/shopping-empty-state";
import { orderStatusBadgeClass } from "@/app/_components/order-status-badge";
import { Stagger, StaggerItem } from "@/app/_components/motion/reveal";
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="display-title text-3xl sm:text-4xl">Orders</h1>
        <p className="text-sm text-muted">Your past orders and their status.</p>
      </div>

      {orders.length === 0 ? (
        <ShoppingEmptyState icon="bag" message="You haven't placed any orders yet." />
      ) : (
        <Stagger as="ul" className="flex flex-col gap-3">
          {orders.map((order) => (
            <StaggerItem as="li" key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="card card-interactive group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-6 sm:p-5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">
                    Order #{order.id.slice(0, 8)}
                  </span>
                  <span className="text-muted tabular-nums">
                    {new Date(order.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`justify-self-end capitalize sm:order-3 ${orderStatusBadgeClass(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-muted sm:order-2">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"} &middot;{" "}
                  <span className="font-semibold text-foreground tabular-nums">{formatPrice(order.total)}</span>
                </span>
                <span aria-hidden="true" className="hidden text-subtle transition-transform group-hover:translate-x-0.5 sm:order-4 sm:block">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                    <path d="m8 5 5 5-5 5" />
                  </svg>
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
