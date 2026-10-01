import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Return & Refund Policy",
  description: "How returns, refunds, cancellations and damaged or incorrect items are handled at Nexora Commerce.",
};

// Nexora has no online returns workflow, return labels or refund automation,
// and checkout doesn't currently take payment — so every return and refund
// question is routed to support, and no window, label or timeline is
// promised.
const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <p>
        We want you to be happy with what you order from Nexora. Returns and refunds are handled by our support team
        case by case — there isn&apos;t an online returns form or automated refund process in the store. This policy
        explains how to reach us and what to expect.
      </p>
    ),
  },
  {
    id: "return-eligibility",
    title: "Return Eligibility",
    body: (
      <p>
        Whether a return can be accepted depends on the product, its condition and the circumstances of the order. Contact
        us after receiving your order and we&apos;ll confirm whether a return is possible before you send anything back.
      </p>
    ),
  },
  {
    id: "starting-a-return",
    title: "Starting a Return",
    body: (
      <>
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> (or use the form on our{" "}
          <Link href="/contact">Contact</Link> page with the subject &ldquo;Returns&rdquo;) and include:
        </p>
        <ul>
          <li>the email address on your Nexora account;</li>
          <li>the order date and the product(s) concerned;</li>
          <li>the reason for the return, with photos if the item is damaged or incorrect.</li>
        </ul>
        <p>
          Please wait for our reply before returning anything — we&apos;ll explain the next steps for your situation.
        </p>
      </>
    ),
  },
  {
    id: "condition-of-returned-products",
    title: "Condition of Returned Products",
    body: (
      <p>
        Where a return is agreed, products should generally be returned unused, in their original condition and
        packaging, with any included accessories. We&apos;ll confirm any specific requirements when we reply.
      </p>
    ),
  },
  {
    id: "non-returnable-situations",
    title: "Non-Returnable Situations",
    body: (
      <p>
        Some returns may not be possible — for example, products that have been used, damaged after delivery, or that
        can&apos;t be resold for hygiene or safety reasons. We&apos;ll let you know if this applies to your request.
      </p>
    ),
  },
  {
    id: "exchanges",
    title: "Exchanges",
    body: (
      <p>
        Nexora doesn&apos;t offer automatic exchanges. If you&apos;d like a different product, contact us and we&apos;ll
        explain the options available for your order.
      </p>
    ),
  },
  {
    id: "refunds",
    title: "Refunds",
    body: (
      <p>
        Online payment isn&apos;t currently active in Nexora checkout, so orders placed in the store aren&apos;t charged
        online and there&apos;s nothing to refund automatically. When online payment through our selected provider,
        PayFast, becomes available, refunds for eligible returns will be reviewed by our support team — Nexora
        doesn&apos;t perform automatic refunds. For refund questions, contact us. See our{" "}
        <Link href="/payment-policy">Payment Policy</Link> for more information.
      </p>
    ),
  },
  {
    id: "order-cancellations",
    title: "Order Cancellations",
    body: (
      <p>
        Orders can&apos;t be cancelled from your account. The store can cancel an order while it&apos;s still Pending or
        Processing — contact us as soon as possible if you&apos;d like to cancel. Once an order has shipped it can no
        longer be cancelled. A cancelled order shows the status <strong>Cancelled</strong> in your{" "}
        <Link href="/orders">order history</Link>.
      </p>
    ),
  },
  {
    id: "damaged-or-incorrect-items",
    title: "Damaged or Incorrect Items",
    body: (
      <p>
        If a product arrives damaged, defective or isn&apos;t what you ordered, please contact us promptly with your order
        details and photos of the item and packaging. We&apos;ll review it and explain how we can help.
      </p>
    ),
  },
  {
    id: "need-assistance",
    title: "Need Assistance",
    body: (
      <p>
        For any question about a return, refund or cancellation, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our <Link href="/contact">Contact</Link> page for
        phone, address and business hours.
      </p>
    ),
  },
];

export default function ReturnsPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Return & Refund Policy"
      intro="This policy explains how returns, refunds, cancellations and damaged or incorrect items are handled for orders placed on Nexora."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
