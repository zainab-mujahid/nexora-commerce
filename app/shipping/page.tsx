import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "How Nexora Commerce processes orders, uses your shipping information and shows order status.",
};

// Conservative on purpose: Nexora records orders, shipping addresses and
// order status, but has no carrier integration, shipping-rate calculation,
// delivery estimates or tracking numbers — so none are promised here.
const SECTIONS: LegalSection[] = [
  {
    id: "order-processing",
    title: "Order Processing",
    body: (
      <>
        <p>
          When you place an order, Nexora checks that each product is still available in the quantity you selected and
          records the order with the products, prices and shipping address shown at checkout. Your order then appears in
          your <Link href="/orders">order history</Link> with the status <strong>Pending</strong>.
        </p>
        <p>Orders are processed after they are placed and are subject to product availability.</p>
      </>
    ),
  },
  {
    id: "shipping-information",
    title: "Shipping Information",
    body: (
      <p>
        At checkout you choose one of the shipping addresses saved in your account. You can add, edit and set a default
        address in <Link href="/account/addresses">My Account</Link>. A copy of the selected address is stored with the
        order, so later edits to your saved addresses don&apos;t change orders you&apos;ve already placed.
      </p>
    ),
  },
  {
    id: "delivery-estimates",
    title: "Delivery Estimates",
    body: (
      <p>
        Nexora doesn&apos;t currently provide delivery-date estimates at checkout. Available shipping options and
        estimated delivery information are presented as part of the applicable order experience where available. The
        most current information about your order is its status in your order history.
      </p>
    ),
  },
  {
    id: "shipping-charges",
    title: "Shipping Charges",
    body: (
      <p>
        Shipping charges aren&apos;t currently calculated in Nexora checkout — the order total shown is the product
        subtotal. If shipping charges are introduced, they will be shown clearly before you place an order.
      </p>
    ),
  },
  {
    id: "order-status",
    title: "Order Status",
    body: (
      <>
        <p>Each order shows one of the following statuses, which the store updates as the order progresses:</p>
        <ul>
          <li>
            <strong>Pending</strong> — your order has been received.
          </li>
          <li>
            <strong>Processing</strong> — your order is being prepared.
          </li>
          <li>
            <strong>Shipped</strong> — your order has been sent.
          </li>
          <li>
            <strong>Delivered</strong> — your order has been completed.
          </li>
          <li>
            <strong>Cancelled</strong> — your order will not be fulfilled.
          </li>
        </ul>
        <p>Nexora doesn&apos;t currently provide carrier tracking numbers or shipping notification emails.</p>
      </>
    ),
  },
  {
    id: "address-accuracy",
    title: "Address Accuracy",
    body: (
      <p>
        Please make sure your shipping address is complete and correct before placing an order. Because the address is
        saved with the order, changes made to your saved addresses afterwards won&apos;t update an existing order. If you
        notice a mistake, contact us as soon as possible.
      </p>
    ),
  },
  {
    id: "delivery-issues",
    title: "Delivery Issues",
    body: (
      <p>
        If an order marked as Delivered hasn&apos;t arrived, or something about the delivery isn&apos;t right, contact
        our support team with your order details and we&apos;ll look into it with you.
      </p>
    ),
  },
  {
    id: "lost-or-delayed-orders",
    title: "Lost or Delayed Orders",
    body: (
      <p>
        If your order&apos;s status hasn&apos;t changed for longer than you&apos;d expect, or you believe it has been
        lost, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the order date and the email address on
        your account so we can review it.
      </p>
    ),
  },
  {
    id: "changes-and-cancellations",
    title: "Changes & Cancellations",
    body: (
      <p>
        Orders can&apos;t be changed or cancelled from your account once placed. The store can cancel an order while
        it&apos;s still Pending or Processing; once it has shipped, it can no longer be cancelled. To request a change or
        cancellation, contact us as early as possible. See our <Link href="/returns">Return &amp; Refund Policy</Link>{" "}
        for questions after delivery.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For shipping questions, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{" "}
        <Link href="/contact">Contact</Link> page.
      </p>
    ),
  },
];

export default function ShippingPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Shipping Policy"
      intro="This policy explains how Nexora processes orders, how your shipping information is used, and how you can follow an order after it's placed."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
