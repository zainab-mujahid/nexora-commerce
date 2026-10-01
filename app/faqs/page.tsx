import type { Metadata } from "next";
import Link from "next/link";

import { FaqAccordion, type FaqItem } from "@/app/_components/faq-accordion";
import { InfoHero, InfoMain, SupportCallout } from "@/app/_components/info-page";
import { Reveal } from "@/app/_components/motion/reveal";

export const metadata: Metadata = {
  title: "Nexora FAQs",
  description:
    "Answers about shopping on Nexora: browsing and search, the AI shopping assistant, your account, cart and wishlist, orders, shipping, returns and payments.",
};

const GROUPS: { id: string; title: string; items: FaqItem[] }[] = [
  {
    id: "shopping",
    title: "Shopping",
    items: [
      {
        question: "How do I browse products on Nexora?",
        answer: (
          <p>
            Open <Link href="/products">Shop</Link> to see the full catalog. You can filter by category and sort by
            newest, price (low to high or high to low) or name, and move through the results page by page.
          </p>
        ),
      },
      {
        question: "Can I browse products by category?",
        answer: (
          <p>
            Yes. Visit <Link href="/categories">Categories</Link>, use the Categories menu in the header, or choose a
            category on the Shop page to see only the products in it.
          </p>
        ),
      },
      {
        question: "How do I search for a specific product?",
        answer: (
          <p>
            Use the search field in the header or on the Shop page. Search by a product&apos;s name, or describe what
            you&apos;re looking for — close name matches appear first, and search can also find products that fit your
            description when the wording is different.
          </p>
        ),
      },
      {
        question: "Where can I see full product details?",
        answer: (
          <p>
            Select any product to open its page, with its description, price, category, current stock and images where available. From
            there you can add it to your cart or wishlist.
          </p>
        ),
      },
    ],
  },
  {
    id: "assistant",
    title: "AI Shopping Assistant",
    items: [
      {
        question: "What is the Nexora AI Shopping Assistant?",
        answer: (
          <p>
            It&apos;s a built-in assistant on the home and shop pages. Open it with the &ldquo;AI Shopping
            Assistant&rdquo; button and describe what you need in your own words.
          </p>
        ),
      },
      {
        question: "What can the assistant help me with?",
        answer: (
          <p>
            Finding products that match a need, a budget or a use — for example &ldquo;a gift under $50&rdquo; — and
            explaining why each suggestion fits. Its suggestions also appear as product cards on the page, linked to each
            product.
          </p>
        ),
      },
      {
        question: "Does the assistant only recommend products available on Nexora?",
        answer: (
          <p>
            Yes. It suggests only products from the current Nexora catalog. Suggestions are generated automatically and
            can occasionally be incomplete, so please check the product page — its price, details and stock — before you
            buy.
          </p>
        ),
      },
      {
        question: "Can it understand follow-up questions?",
        answer: (
          <p>
            Yes. Within a conversation you can ask things like &ldquo;which one is cheaper?&rdquo; or &ldquo;show me
            another one&rdquo;. It remembers only a few recent messages, for a short time, and a new conversation starts
            when you reload or leave the page.
          </p>
        ),
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      {
        question: "Do I need an account to use Nexora?",
        answer: (
          <p>
            No account is needed to browse, search or use the AI assistant. To keep a cart or wishlist, save shipping
            addresses and place orders, <Link href="/signup">create a free account</Link>.
          </p>
        ),
      },
      {
        question: "Where can I manage my account information?",
        answer: (
          <p>
            In <Link href="/account">My Account</Link> you can update your name and add, edit, remove or choose a default
            shipping address. If you forget your password, select &ldquo;Forgot password?&rdquo; on the sign-in page to
            receive a reset code by email.
          </p>
        ),
      },
      {
        question: "Where can I view my orders?",
        answer: (
          <p>
            <Link href="/orders">Orders</Link> lists every order you&apos;ve placed. Open one to see its items, the
            shipping address used and its current status.
          </p>
        ),
      },
    ],
  },
  {
    id: "cart",
    title: "Cart & Wishlist",
    items: [
      {
        question: "How do I add, remove or change quantities in my cart?",
        answer: (
          <p>
            Add products from their product page. In your <Link href="/cart">cart</Link> you can update the quantity of
            any item or remove it. Quantities are limited to the stock currently available — if a request is more than
            what&apos;s in stock, we&apos;ll let you know and adjust it.
          </p>
        ),
      },
      {
        question: "What is the wishlist used for?",
        answer: (
          <p>
            Your <Link href="/wishlist">wishlist</Link> saves products you want to come back to. You can move an item to
            your cart or remove it at any time, and products that become unavailable are clearly marked.
          </p>
        ),
      },
    ],
  },
  {
    id: "orders",
    title: "Orders & Policies",
    items: [
      {
        question: "How do orders and payments work?",
        answer: (
          <>
            <p>
              Go to checkout from your cart, choose a saved shipping address, review your items and place the order.
              Each order then shows a status in your order history: <strong>Pending</strong>,{" "}
              <strong>Processing</strong>, <strong>Shipped</strong>, <strong>Delivered</strong> or{" "}
              <strong>Cancelled</strong>.
            </p>
            <p>
              Online payment isn&apos;t active in Nexora checkout yet, so placing an order doesn&apos;t charge you — see
              the <Link href="/payment-policy">Payment Policy</Link>. Our <Link href="/shipping">Shipping Policy</Link>{" "}
              explains how orders are handled.
            </p>
          </>
        ),
      },
      {
        question: "Can I return a product or request a refund?",
        answer: (
          <p>
            Returns and refunds are handled by our support team rather than an online form. Our{" "}
            <Link href="/returns">Return &amp; Refund Policy</Link> explains how to reach us and what to include.
          </p>
        ),
      },
      {
        question: "How is my personal information handled?",
        answer: (
          <p>
            We use your information to provide your account, orders and the features you use, and Nexora doesn&apos;t use
            advertising or analytics trackers. Read the <Link href="/privacy">Privacy Policy</Link> for details.
          </p>
        ),
      },
    ],
  },
];

export default function FaqsPage() {
  const count = GROUPS.reduce((total, group) => total + group.items.length, 0);
  return (
    <InfoMain>
      <InfoHero
        eyebrow="Help Center"
        title="Frequently asked questions"
        intro={`${count} answers about shopping with Nexora — from browsing and search to your account, orders and our policies.`}
      />
      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="FAQ topics" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Topics</p>
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1.5">
            {GROUPS.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="nav-link inline-flex rounded-full border border-border px-3 py-1.5 text-sm lg:rounded-sm lg:border-0 lg:px-0 lg:py-0.5"
                >
                  {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-3xl flex-col gap-10">
          {GROUPS.map((group) => (
            <Reveal as="section" key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="flex scroll-mt-24 flex-col gap-4">
              <h2 id={`${group.id}-heading`} className="text-xl font-semibold tracking-tight">
                {group.title}
              </h2>
              <FaqAccordion items={group.items} />
            </Reveal>
          ))}
          <SupportCallout title="Still have a question?" />
        </div>
      </div>
    </InfoMain>
  );
}
