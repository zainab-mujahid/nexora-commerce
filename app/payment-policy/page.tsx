import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Payment Policy",
  description:
    "How pricing, checkout, payment confirmation and refunds work at Nexora Commerce, with payments processed through Safepay.",
};

// Mirrors the implemented flow: payment first (Safepay hosted checkout), the
// order is created only after Nexora verifies the payment server-side. The
// integration currently runs in Safepay's sandbox, so nothing here presents
// it as live commercial payment processing. No refund window or processing
// time is stated — neither is defined by the implementation.
const SECTIONS: LegalSection[] = [
  {
    id: "payment-status",
    title: "Current Payment Status",
    body: (
      <>
        <div className="info-callout card flex flex-col gap-2 p-5">
          <p>
            <strong>Nexora&apos;s payments currently run in Safepay&apos;s test (sandbox) environment.</strong> While test
            mode is active, payment pages show a &ldquo;Test mode · No real charge&rdquo; badge, and payments are test
            transactions — no real money is charged.
          </p>
        </div>
        <p>
          Online payment at Nexora is processed by <strong>Safepay</strong>, our payment provider. This policy describes
          how checkout, payment confirmation and refunds work.
        </p>
      </>
    ),
  },
  {
    id: "pricing",
    title: "Pricing",
    body: (
      <p>
        Prices are shown in US dollars (USD) on each product page and in your cart and checkout. Prices can change at any
        time, but an order records the prices shown when you checked out. Shipping charges and taxes aren&apos;t currently
        calculated in checkout — the order total is the product subtotal.
      </p>
    ),
  },
  {
    id: "checkout",
    title: "Checkout",
    body: (
      <>
        <p>
          At checkout you review the items in your cart, choose a saved shipping address and continue to secure payment.
          Product availability is checked again at this point, and your items are reserved for a limited time while you
          pay — the payment page shows how long the reservation lasts.
        </p>
        <p>
          You then complete payment on Safepay&apos;s secure checkout page. If you leave without paying, you can return to
          the payment or cancel it; a cancelled or expired checkout releases the reserved items and leaves your cart
          unchanged.
        </p>
      </>
    ),
  },
  {
    id: "payment-methods",
    title: "Payment Methods",
    body: (
      <p>
        Nexora&apos;s checkout is set up for card payments through Safepay. Whether a particular card can be used depends
        on Safepay and on your card issuer.
      </p>
    ),
  },
  {
    id: "payment-confirmation",
    title: "Payment Confirmation",
    body: (
      <>
        <p>
          An order is created and treated as paid only after Nexora has confirmed the payment directly with Safepay.
          Returning to Nexora from the payment page, or reaching a success page, is not on its own treated as proof of
          payment.
        </p>
        <ul>
          <li>
            <strong>Processing</strong> — while a payment is being confirmed, the payment page shows that it&apos;s being
            verified. Please don&apos;t pay again while this is in progress.
          </li>
          <li>
            <strong>Paid</strong> — once confirmed, your order appears in your <Link href="/orders">order history</Link>{" "}
            with its payment shown as Paid.
          </li>
          <li>
            <strong>Under review</strong> — occasionally a payment response needs a manual check. The order or payment is
            then shown as under review, and we&apos;ll follow up with you.
          </li>
        </ul>
        <p>
          Each checkout can result in at most one order. Repeated payment notifications, or returning to Nexora from the
          payment page more than once, won&apos;t create a duplicate order. If you believe you were charged more than once,
          contact us with your order ID.
        </p>
      </>
    ),
  },
  {
    id: "failed-and-cancelled-payments",
    title: "Failed, Declined & Cancelled Payments",
    body: (
      <p>
        If a payment is declined or cancelled, or the reservation ends without a confirmed payment, no order is created
        and the checkout is not treated as paid. Card payments may need authorization from your card issuer — for example, a
        one-time code — and a payment isn&apos;t complete until that authorization succeeds. You can try again while your
        items are still reserved, or check out again later.
      </p>
    ),
  },
  {
    id: "payment-security",
    title: "Payment Security",
    body: (
      <p>
        Card details are entered on Safepay&apos;s checkout page, not on Nexora, and Nexora never receives or stores your
        full card number. To help you recognize a payment, Nexora may record limited details such as the card brand and
        last four digits. How we handle the order and account information we hold is described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>. As with any online service, no payment system can be guaranteed to be
        completely secure.
      </p>
    ),
  },
  {
    id: "billing-information",
    title: "Billing Information",
    body: (
      <p>
        Nexora doesn&apos;t collect separate billing details at checkout. Any information needed to process a card payment
        is requested by Safepay on its checkout page.
      </p>
    ),
  },
  {
    id: "order-confirmation",
    title: "Order Confirmation",
    body: (
      <p>
        After your payment is confirmed, your order appears in your <Link href="/orders">order history</Link> with its
        items, shipping address, order status and payment status. Nexora doesn&apos;t currently send order confirmation
        emails.
      </p>
    ),
  },
  {
    id: "refunds",
    title: "Refunds",
    body: (
      <>
        <p>
          Refunds are issued by Nexora through Safepay to the original payment. A refund can be for the full amount paid or
          for part of it, and the total refunded can never exceed the amount paid. Each refund is subject to validation by
          Nexora and Safepay, so a refund request isn&apos;t guaranteed to succeed, and some refunds may need review before
          they&apos;re completed.
        </p>
        <p>
          Your order shows a refund only once it has been confirmed — as <strong>Partially refunded</strong> or{" "}
          <strong>Refunded</strong>, with the amount refunded. A refund concerns the payment only: it doesn&apos;t by
          itself cancel, return or change the fulfillment of an order. Likewise, cancelling a paid order doesn&apos;t
          automatically issue a refund; any refund is handled separately. How returns are handled is explained in our{" "}
          <Link href="/returns">Return &amp; Refund Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to This Policy",
    body: (
      <p>
        We&apos;ll update this policy — and its &ldquo;Last updated&rdquo; date — when the payment setup changes, for
        example when payments move out of test mode or accepted payment methods change.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For questions about pricing, payments or refunds, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or
        visit our <Link href="/contact">Contact</Link> page. Including your order ID helps us find your payment quickly.
      </p>
    ),
  },
];

export default function PaymentPolicyPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Payment Policy"
      intro="How pricing, checkout, payment confirmation and refunds work at Nexora — with payments processed through Safepay."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
