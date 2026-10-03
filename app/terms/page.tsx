import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Nexora Commerce, create an account, place orders or use AI-assisted features.",
};

// No governing-law clause: that requires a legal/business decision that
// hasn't been made, so it is deliberately left out rather than invented.
const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) apply to your use of the Nexora Commerce website and its features
        (&ldquo;Nexora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By browsing Nexora, creating an account or placing an
        order, you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree,
        please don&apos;t use Nexora.
      </p>
    ),
  },
  {
    id: "use-of-nexora",
    title: "Use of Nexora",
    body: (
      <p>
        Anyone may browse the catalog, search and use the AI shopping assistant. Some features — keeping a cart or
        wishlist, saving shipping addresses and placing orders — require an account. You agree to use Nexora only for
        lawful purposes and in line with these Terms.
      </p>
    ),
  },
  {
    id: "account-responsibilities",
    title: "Account Responsibilities",
    body: (
      <p>
        When you create an account, please provide accurate information and keep it up to date. You&apos;re responsible
        for keeping your password confidential and for activity that takes place under your account. If you believe your
        account has been accessed without permission, change your password and contact us.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    body: (
      <p>
        Use Nexora respectfully and as intended: to browse, compare and purchase products, and to manage your own
        account and orders. Don&apos;t use Nexora in a way that could harm the service, other customers or us.
      </p>
    ),
  },
  {
    id: "product-information",
    title: "Product Information",
    body: (
      <p>
        We aim to describe products accurately, including their names, descriptions, images, categories and prices.
        Images are for illustration, and minor differences may occur. If a product doesn&apos;t match its description,
        see our <Link href="/returns">Return &amp; Refund Policy</Link>.
      </p>
    ),
  },
  {
    id: "product-availability",
    title: "Product Availability",
    body: (
      <p>
        Products are offered while in stock. Stock levels shown on product pages and in your cart reflect current
        availability, and quantities are checked again when you place an order. Products may be changed or removed from
        the catalog at any time.
      </p>
    ),
  },
  {
    id: "pricing",
    title: "Pricing",
    body: (
      <p>
        Prices are shown on product pages and may change at any time without notice. An order records the prices shown
        when it was placed. Shipping charges and taxes aren&apos;t currently calculated in checkout. See our{" "}
        <Link href="/payment-policy">Payment Policy</Link> for how payments work.
      </p>
    ),
  },
  {
    id: "orders",
    title: "Orders",
    body: (
      <p>
        Checking out records your request to purchase the selected products for delivery to the shipping address you
        chose. Payment is made through our payment provider, Safepay, and an order is created only after the payment
        has been confirmed, as described in our <Link href="/payment-policy">Payment Policy</Link>. Payments currently
        run in Safepay&apos;s test mode, where no real money is charged. Orders are subject to availability, and we may
        cancel an order — for example, if a product becomes unavailable or an error in pricing or product information is
        found — while it is still Pending or Processing. Refunds are handled as described in our Payment Policy and{" "}
        <Link href="/returns">Return &amp; Refund Policy</Link>.
      </p>
    ),
  },
  {
    id: "account-and-order-information",
    title: "Account and Order Information",
    body: (
      <p>
        Your account shows your saved addresses and your order history, including each order&apos;s items, shipping
        address and status. Please review your order details carefully before placing an order, as orders can&apos;t be
        edited from your account afterwards. See our <Link href="/shipping">Shipping Policy</Link> for more.
      </p>
    ),
  },
  {
    id: "ai-assisted-shopping",
    title: "AI-Assisted Shopping Features",
    body: (
      <p>
        Nexora&apos;s AI shopping assistant helps you discover products from the Nexora catalog. Its suggestions and
        explanations are generated automatically to assist discovery; they may not always be complete or perfectly
        accurate, and they are not a promise about any product. Always rely on the product information displayed on the
        product page when making a purchasing decision.
      </p>
    ),
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    body: (
      <p>
        Nexora relies on third-party providers for parts of the service, such as account sign-in, data storage, product
        images, AI processing and payment processing (Safepay). These providers operate under their own terms. See our <Link href="/privacy">Privacy Policy</Link> for details.
      </p>
    ),
  },
  {
    id: "third-party-links",
    title: "Third-Party Links",
    body: (
      <p>
        If Nexora links to websites operated by others, we don&apos;t control their content or practices and aren&apos;t
        responsible for them. Please review the terms and policies of any third-party website you visit.
      </p>
    ),
  },
  {
    id: "feedback-and-submissions",
    title: "Feedback & Submissions",
    body: (
      <p>
        If you send us questions, suggestions or other feedback, we may use them to respond to you and to improve Nexora,
        without any obligation to you. Please don&apos;t send confidential or sensitive information.
      </p>
    ),
  },
  {
    id: "personal-information",
    title: "Personal Information",
    body: (
      <p>
        How we collect and use personal information is described in our <Link href="/privacy">Privacy Policy</Link>,
        which forms part of these Terms.
      </p>
    ),
  },
  {
    id: "errors-and-omissions",
    title: "Errors and Omissions",
    body: (
      <p>
        Information on Nexora may occasionally contain typographical errors, inaccuracies or omissions relating to
        product descriptions, pricing or availability. We may correct such errors, update information, or cancel affected
        orders that haven&apos;t shipped.
      </p>
    ),
  },
  {
    id: "prohibited-uses",
    title: "Prohibited Uses",
    body: (
      <>
        <p>You may not:</p>
        <ul>
          <li>access, or attempt to access, other people&apos;s accounts, data or restricted areas of Nexora;</li>
          <li>interfere with the security or operation of the service, or send excessive automated requests;</li>
          <li>attempt to bypass usage limits or other protections;</li>
          <li>use the AI assistant for purposes unrelated to shopping, or attempt to make it ignore its rules;</li>
          <li>use Nexora for any unlawful, fraudulent or harmful purpose, or to infringe the rights of others.</li>
        </ul>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    body: (
      <p>
        The Nexora name, logo, design and site content may not be copied, reproduced or reused without permission.
        Product names, brands and trademarks belong to their respective owners.
      </p>
    ),
  },
  {
    id: "service-availability",
    title: "Service Availability",
    body: (
      <p>
        We work to keep Nexora available and running smoothly, but we don&apos;t guarantee uninterrupted access. Features
        may change, and parts of the service — such as the AI assistant — may be limited or unavailable at times, for
        example during maintenance or periods of high demand.
      </p>
    ),
  },
  {
    id: "disclaimer-of-warranties",
    title: "Disclaimer of Warranties",
    body: (
      <p>
        To the extent permitted by law, Nexora is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
        warranties of any kind beyond those that cannot be excluded by law.
      </p>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    body: (
      <p>
        To the extent permitted by law, we aren&apos;t liable for indirect or consequential losses arising from your use
        of Nexora, from service interruptions, or from reliance on automated suggestions. Nothing in these Terms limits
        any rights you have that cannot be limited by law.
      </p>
    ),
  },
  {
    id: "severability",
    title: "Severability",
    body: (
      <p>
        If any part of these Terms is found to be unenforceable, the remaining parts will continue to apply.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>
        We may restrict or end access to Nexora for anyone who breaches these Terms or misuses the service. These Terms
        continue to apply to your past use of Nexora.
      </p>
    ),
  },
  {
    id: "changes-to-the-terms",
    title: "Changes to the Terms",
    body: (
      <p>
        We may update these Terms from time to time. When we do, we&apos;ll revise the &ldquo;Last updated&rdquo; date
        above. Continuing to use Nexora after a change means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: "contact-information",
    title: "Contact Information",
    body: (
      <p>
        Questions about these Terms can be sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. All contact
        options are listed on our <Link href="/contact">Contact</Link> page.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms explain the rules for using Nexora Commerce — your account, orders, AI-assisted features and the service as a whole. Please read them carefully."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
