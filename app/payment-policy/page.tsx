import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Payment Policy",
  description:
    "Pricing, checkout and payments at Nexora Commerce, including our selected payment provider, PayFast Pakistan, and the payment methods it supports.",
};

// PayFast Pakistan is Nexora's selected payment provider, but it is not yet
// integrated into checkout (no payment step exists in the code). This page
// keeps "supported by PayFast" and "active in Nexora checkout" clearly apart
// and never implies that a charge happens today.
const CARD_NETWORKS = ["Visa", "Mastercard", "UnionPay International", "PayPak"] as const;
const OTHER_CHANNELS = ["Bank Account", "Mobile Wallet", "Raast"] as const;

const SECTIONS: LegalSection[] = [
  {
    id: "payment-status",
    title: "Current Payment Status",
    body: (
      <>
        <div className="info-callout card flex flex-col gap-2 p-5">
          <p>
            <strong>Online payment isn&apos;t active in Nexora checkout yet.</strong> Placing an order records it with
            the products, prices and shipping address shown at checkout, but no payment is requested or charged.
          </p>
        </div>
        <p>
          Nexora has selected <strong>PayFast Pakistan</strong> as its payment provider. This policy describes how
          payments will work through PayFast once it is enabled in checkout, and how orders are handled until then.
        </p>
      </>
    ),
  },
  {
    id: "pricing",
    title: "Pricing",
    body: (
      <p>
        Prices are shown on each product page and in your cart and checkout. Prices can change at any time, but an order
        records the prices shown when it was placed. Shipping charges and taxes aren&apos;t currently calculated in
        checkout — the order total is the product subtotal.
      </p>
    ),
  },
  {
    id: "checkout",
    title: "Checkout",
    body: (
      <p>
        At checkout you review the items in your cart, choose a saved shipping address and place your order. Product
        availability is checked again when the order is placed. When online payment is enabled, a payment step through
        PayFast will be part of this flow, and an order will only be treated as paid once the payment has been
        successfully completed.
      </p>
    ),
  },
  {
    id: "accepted-payment-methods",
    title: "Accepted Payment Methods",
    body: (
      <>
        <p>
          The following payment methods are <strong>supported by our selected payment provider, PayFast</strong>. They are
          expected to become available in Nexora once PayFast is enabled in checkout; none are active in Nexora checkout
          today.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card flex flex-col gap-3 p-5">
            <h3>Card networks</h3>
            <ul className="list-none pl-0">
              {CARD_NETWORKS.map((name) => (
                <li key={name} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-3 p-5">
            <h3>Other payment channels</h3>
            <ul className="list-none pl-0">
              {OTHER_CHANNELS.map((name) => (
                <li key={name} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p>
          Availability of a particular method can depend on PayFast and on your bank, card issuer or wallet provider.
        </p>
      </>
    ),
  },
  {
    id: "payment-processing",
    title: "Payment Processing",
    body: (
      <p>
        Nexora intends to use PayFast as its payment gateway for supported online transactions. When PayFast is active,
        payment details are entered through PayFast&apos;s payment flow. Nexora does not store complete card details.
      </p>
    ),
  },
  {
    id: "payment-security",
    title: "Payment Security",
    body: (
      <p>
        PayFast operates as the payment processor and maintains its own payment-security standards for the transactions
        it handles. Nexora protects the order and account information it holds as described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>. As with any online service, no payment system can be guaranteed to
        be completely secure.
      </p>
    ),
  },
  {
    id: "payment-authorization",
    title: "Payment Authorization",
    body: (
      <p>
        Card and other digital payments may require authorization or verification by your issuing bank, wallet provider
        or payment service — for example, a one-time code. If authorization is declined or not completed, the payment is
        not complete and the order is not considered paid.
      </p>
    ),
  },
  {
    id: "order-confirmation",
    title: "Order Confirmation",
    body: (
      <p>
        After you place an order it appears immediately in your <Link href="/orders">order history</Link> with its items,
        shipping address and status. Nexora doesn&apos;t currently send order confirmation emails.
      </p>
    ),
  },
  {
    id: "billing-information",
    title: "Billing Information",
    body: (
      <p>
        Nexora doesn&apos;t currently collect separate billing details at checkout. When online payment is enabled, any
        billing information required for a payment will be requested as part of the PayFast payment flow.
      </p>
    ),
  },
  {
    id: "refunds-and-returns",
    title: "Refunds & Returns",
    body: (
      <p>
        Refunds are handled under our <Link href="/returns">Return &amp; Refund Policy</Link>. Nexora doesn&apos;t
        perform automatic refunds, and because online payment isn&apos;t active yet, there are currently no online
        payments to refund.
      </p>
    ),
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to This Policy",
    body: (
      <p>
        We&apos;ll update this policy — and its &ldquo;Last updated&rdquo; date — when online payment is enabled or when
        accepted payment methods change.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For questions about pricing or payments, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit
        our <Link href="/contact">Contact</Link> page.
      </p>
    ),
  },
];

export default function PaymentPolicyPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Payment Policy"
      intro="Clear information about pricing, checkout and payments at Nexora — including our selected payment provider and what is active in checkout today."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
