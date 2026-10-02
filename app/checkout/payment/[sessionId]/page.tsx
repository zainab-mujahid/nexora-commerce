import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Reveal } from "@/app/_components/motion/reveal";
import { TestModeBadge } from "@/app/_components/test-mode-badge";
import { requireUser } from "@/lib/auth/dal";
import { getOwnCheckoutStatus } from "@/lib/checkout/queries";
import { formatPrice } from "@/lib/catalog/format";
import { getPaymentAvailability } from "@/lib/payments/presentation";

import { OpenCheckoutActions } from "./payment-actions";

export const metadata: Metadata = {
  title: "Payment",
};

type Tone = "neutral" | "progress" | "success" | "warning" | "danger";

const TONE_RING: Record<Tone, string> = {
  neutral: "text-accent",
  progress: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const ICONS: Record<string, ReactNode> = {
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.8" /></>,
  alert: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5M12 15.8h.01" /></>,
  x: <><circle cx="12" cy="12" r="8" /><path d="m9.5 9.5 5 5M14.5 9.5l-5 5" /></>,
  shield: <><path d="M12 3.5 5.5 6v5.2c0 4 2.7 7.4 6.5 8.8 3.8-1.4 6.5-4.8 6.5-8.8V6L12 3.5Z" /><path d="M12 9v3.5M12 15.5h.01" /></>,
};

function minutesLeft(iso: string): number {
  return Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

// The customer's view of one checkout's payment. Everything shown is read
// from the database (the checkout session and its latest payment attempt,
// through the customer's own RLS-scoped client); URL parameters only choose
// wording. A verified, finalized payment goes straight to the real order.
export default async function CheckoutPaymentPage({
  params,
  searchParams,
}: PageProps<"/checkout/payment/[sessionId]">) {
  await requireUser();
  const { sessionId } = await params;
  const query = await searchParams;
  const status = await getOwnCheckoutStatus(sessionId);
  if (!status) notFound();

  const { view } = status;
  if (view.kind === "confirmed") redirect(`/orders/${view.orderId}?placed=1`);

  const payment = getPaymentAvailability();
  const providerLabel = payment.available ? payment.providerLabel : "the payment provider";
  const testMode = payment.available && payment.testMode;
  const fromCancel = query.from === "cancel";
  const notice = query.notice === "unavailable" || query.notice === "verify";

  let tone: Tone = "neutral";
  let icon = "lock";
  let title: string;
  let message: string;
  let actions: ReactNode = null;
  const open = (props: Partial<Parameters<typeof OpenCheckoutActions>[0]>) => (
    <OpenCheckoutActions checkoutSessionId={status.id} providerLabel={providerLabel} canResume canCancel autoCheck={false} {...props} />
  );

  switch (view.kind) {
    case "awaiting":
    case "pending":
      title = fromCancel ? "You haven't paid yet" : "Complete your payment";
      message = notice
        ? `We couldn't reach ${providerLabel} just now. Your items are still reserved — please try again.`
        : fromCancel
          ? `You left the secure payment page before finishing. Your items stay reserved for about ${minutesLeft(view.reservedUntil)} more minutes — if your card was declined, you can try again.`
          : `Your items are reserved for about ${minutesLeft(view.reservedUntil)} more minutes. Pay on ${providerLabel}'s secure page to confirm your order.`;
      actions = open({ canResume: payment.available });
      break;
    case "declined":
      tone = "danger";
      icon = "x";
      title = "Payment declined";
      message = `The payment wasn't approved and no charge was made. You can try again — your items stay reserved for about ${minutesLeft(view.reservedUntil)} more minutes.`;
      actions = open({ canResume: payment.available });
      break;
    case "processing":
      tone = "progress";
      icon = "clock";
      title = "Verifying your payment";
      message = notice
        ? "We couldn't confirm your payment with the provider yet. This page will keep checking — please don't pay again."
        : "Your payment is being confirmed with the provider. This usually takes a moment — please don't pay again.";
      actions = open({ canResume: false, canCancel: false, autoCheck: true });
      break;
    case "expired_pending":
      // The hold time has passed but nothing has been decided yet: we only
      // release after the provider confirms no payment was made.
      tone = "progress";
      icon = "clock";
      title = "Confirming your payment";
      message = "The time to pay for this checkout has ended. We're checking with the payment provider whether a payment was completed before we release your items — please don't pay again.";
      actions = open({ canResume: false, autoCheck: true, cancelLabel: "I didn't pay — release my items" });
      break;
    case "cancelled":
      icon = "x";
      title = "Checkout cancelled";
      message = "No payment was taken and your cart hasn't changed.";
      actions = <Link href="/cart" className="btn btn-primary btn-lg w-full">Back to cart</Link>;
      break;
    case "expired":
      tone = "warning";
      icon = "clock";
      title = "Your reservation expired";
      message = "We didn't receive a completed payment within the reservation time, so the items went back on sale. Your cart hasn't changed — you can check out again whenever you're ready.";
      actions = (
        <div className="flex w-full flex-col gap-2">
          <Link href="/checkout" className="btn btn-primary btn-lg w-full">Check out again</Link>
          <Link href="/cart" className="link-action self-center text-sm">Back to cart</Link>
        </div>
      );
      break;
    case "review":
      tone = "warning";
      icon = "shield";
      title = "We're reviewing your payment";
      message = "We received a payment response that needs a quick manual check, so your order isn't confirmed yet. Please don't pay again — our team will follow up with you.";
      actions = <Link href="/contact" className="btn btn-secondary btn-lg w-full">Contact support</Link>;
      break;
  }

  return (
    <main className="relative isolate mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16">
      <div aria-hidden="true" className="surface-grid absolute inset-0 -z-10" />
      <Reveal trigger="mount" scale={0.985} className="card surface-glow flex w-full max-w-lg flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className={`flex size-14 items-center justify-center rounded-2xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-border ${TONE_RING[tone]}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`size-6 ${tone === "progress" ? "motion-safe:animate-pulse" : ""}`}>
              {ICONS[icon]}
            </svg>
          </span>
          {testMode && <TestModeBadge />}
          <h1 className="display-title text-2xl sm:text-3xl">{title}</h1>
          <p aria-live="polite" className="max-w-sm text-sm leading-relaxed text-muted">{message}</p>
        </div>

        <section aria-label="Checkout summary" className="flex flex-col gap-2 rounded-lg border border-border bg-fill/40 p-4 text-sm">
          <ul className="flex flex-col gap-1.5">
            {status.items.map((item) => (
              <li key={item.name} className="flex items-start justify-between gap-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {item.name} <span className="text-muted">&times; {item.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatPrice(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-border pt-2 font-semibold">
            <span>
              Total <span className="ml-1 text-xs font-medium tracking-wide text-subtle">USD</span>
            </span>
            <span className="tabular-nums">{formatPrice(status.total)}</span>
          </div>
          {status.paymentMethod && (
            <p className="text-xs text-subtle">
              {status.paymentMethod.brand ?? "Card"}
              {status.paymentMethod.last4 ? ` •••• ${status.paymentMethod.last4}` : ""}
            </p>
          )}
        </section>

        {actions}
      </Reveal>
      <Link href="/orders" className="nav-link mt-6 text-sm">
        View your orders
      </Link>
    </main>
  );
}
