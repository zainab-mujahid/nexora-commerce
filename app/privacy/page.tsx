import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/app/_components/info-page";
import { POLICIES_UPDATED, SUPPORT_EMAIL } from "@/app/_components/support-contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Nexora Commerce collects, uses and protects information when you shop, pay, use your account or the AI shopping assistant.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "Information We Collect",
    body: (
      <>
        <p>We collect only the information needed to provide Nexora&apos;s features.</p>
        <h3>Account &amp; contact information</h3>
        <p>
          When you create an account we collect your name, email address and a password. You can add shipping addresses
          to your account: the recipient&apos;s name and the street address, city, region, postal code and country.
        </p>
        <h3>Order information</h3>
        <p>
          When you place an order we record the products, quantities and prices, the order total, its status (such as
          Pending, Processing, Shipped, Delivered or Cancelled) and a copy of the shipping address used — so your order
          history stays accurate even if you later change that address.
        </p>
        <h3>Payment information</h3>
        <p>
          Payments are processed by our payment provider, Safepay. You enter your card details on Safepay&apos;s checkout
          page, so Nexora never receives or stores your full card number. Nexora sends Safepay only what it needs to
          process the payment — the amount, the currency and an order reference — not your name, address or the
          products you bought. From Safepay, Nexora records the payment&apos;s status and amounts, any refunds, and
          limited details that help you recognize the payment, such as the card brand and last four digits. Information
          you give Safepay directly is handled under Safepay&apos;s own terms and privacy practices.
        </p>
        <h3>Account security information</h3>
        <p>
          Sign-in is handled by our authentication provider. Nexora does not store your password in readable form and
          never displays it. If you reset your password, a one-time code is sent to your email address.
        </p>
        <h3>Shopping activity</h3>
        <p>
          The products in your cart and wishlist are saved to your account so they&apos;re there when you return. Search
          terms you enter are used to find matching products.
        </p>
        <h3>AI assistant interactions</h3>
        <p>
          Messages you write to the AI shopping assistant are processed to understand your request and suggest products.
          A short, temporary conversational context is kept so the assistant can understand follow-up questions (see
          section 5).
        </p>
        <h3>Technical &amp; session information</h3>
        <p>
          Cookies needed to keep you signed in and to operate features you use are described in section 4. Our systems
          also record limited operational information — such as whether a request succeeded and how long it took — to
          keep the service running reliably.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How We Use Information",
    body: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>create, maintain and secure your account;</li>
          <li>operate shopping features such as search, your cart and your wishlist;</li>
          <li>record your orders and show them, with their status, in your order history;</li>
          <li>process payments, confirm them with our payment provider and handle refunds;</li>
          <li>provide AI-assisted product discovery when you use the shopping assistant;</li>
          <li>respond to questions you send to our support team;</li>
          <li>protect the service and its users, for example by limiting excessive or automated requests.</li>
        </ul>
        <p>
          Nexora does not sell your personal information and does not use it for advertising. We don&apos;t use
          analytics or advertising tracking tools.
        </p>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    body: (
      <>
        <p>Nexora relies on a small number of service providers that process information on our behalf:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — account sign-in and the database that holds account, address, cart, wishlist and
            order information.
          </li>
          <li>
            <strong>Amazon Web Services (AWS)</strong> — storage and delivery of product images.
          </li>
          <li>
            <strong>Google Gemini</strong> — AI processing for the shopping assistant and for parts of product search.
          </li>
          <li>
            <strong>Upstash</strong> — short-term storage of recent shopping-assistant conversation context.
          </li>
          <li>
            <strong>Safepay</strong> — payment processing on its secure checkout page, payment confirmation and refunds.
          </li>
        </ul>
        <p>
          These providers handle information only to deliver these services to Nexora and operate under their own terms
          and privacy practices.
        </p>
      </>
    ),
  },
  {
    id: "cookies-and-sessions",
    title: "Cookies & Sessions",
    body: (
      <>
        <p>Nexora uses only cookies and browser storage that are needed for the store to work:</p>
        <ul>
          <li>
            <strong>Sign-in cookies</strong> keep you securely signed in as you move between pages.
          </li>
          <li>
            <strong>Password-reset cookies</strong> are used only during a password reset and expire within an hour.
          </li>
          <li>
            <strong>A shopping-assistant session cookie</strong> is set if you use the assistant without signing in, so
            your conversation is kept separate from other visitors&apos;. It expires when you close your browser.
          </li>
          <li>
            <strong>Your light/dark theme choice</strong> is saved in your browser&apos;s local storage.
          </li>
        </ul>
        <p>
          We don&apos;t use advertising or cross-site tracking cookies. You can clear or block cookies in your browser
          settings, but signing in and some features won&apos;t work without them.
        </p>
      </>
    ),
  },
  {
    id: "ai-assisted-features",
    title: "AI-Assisted Features",
    body: (
      <>
        <p>
          The AI shopping assistant helps you discover products from the Nexora catalog. When you use it, your messages
          are processed — including by our AI service provider — to understand what you&apos;re looking for and to
          generate a response.
        </p>
        <p>
          To understand follow-up questions, a few of the most recent messages and replies in your conversation are kept
          temporarily — for no more than 30 minutes after your last message — and are then deleted automatically. Please
          don&apos;t share sensitive personal information with the assistant.
        </p>
        <p>
          AI suggestions support your browsing but can be incomplete or imperfect. Always rely on the information shown
          on the product page when making a purchasing decision.
        </p>
      </>
    ),
  },
  {
    id: "data-security",
    title: "Data Security",
    body: (
      <p>
        Nexora uses technical and organizational measures appropriate to the application to help protect information.
        For example, account data is accessible only to the signed-in account holder and, where needed to manage orders,
        to store administrators; connections to our service providers are encrypted; and service credentials are kept on
        our servers, never in your browser. No method of transmission or storage is completely secure, so we can&apos;t
        guarantee absolute security.
      </p>
    ),
  },
  {
    id: "your-choices",
    title: "Your Choices",
    body: (
      <>
        <ul>
          <li>You can browse, search and use the AI assistant without creating an account.</li>
          <li>
            In <Link href="/account">My Account</Link> you can update your name and add, edit or delete saved shipping
            addresses.
          </li>
          <li>You can remove products from your cart and wishlist at any time.</li>
          <li>You can control cookies through your browser settings.</li>
        </ul>
        <p>
          For other requests about your account information, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Self-service account deletion isn&apos;t currently
          available in the app.
        </p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention",
    body: (
      <p>
        We keep account information, saved addresses, cart and wishlist contents for as long as your account is active
        or until you remove them. Order, payment and refund records are kept so your order history and payment records
        remain complete and accurate. Shopping-assistant
        conversation context is temporary and expires automatically, as described in section 5.
      </p>
    ),
  },
  {
    id: "international-processing",
    title: "International Processing",
    body: (
      <p>
        Our service providers operate cloud infrastructure that may be located in different countries. As a result,
        information may be processed or stored outside the country where you live, where data-protection rules may
        differ.
      </p>
    ),
  },
  {
    id: "policy-updates",
    title: "Policy Updates",
    body: (
      <p>
        We may update this Privacy Policy as Nexora changes. When we do, we&apos;ll revise the &ldquo;Last
        updated&rdquo; date at the top of this page. Continuing to use Nexora after an update means the updated policy
        applies.
      </p>
    ),
  },
  {
    id: "questions-and-support",
    title: "Questions & Support",
    body: (
      <p>
        If you have questions about this policy or how your information is handled, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or see our <Link href="/contact">Contact</Link> page for
        all contact options.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="At Nexora Commerce, protecting customer privacy and handling information responsibly are important parts of the shopping experience. This policy explains what we collect, how we use it, and the choices you have."
      updated={POLICIES_UPDATED}
      sections={SECTIONS}
    />
  );
}
