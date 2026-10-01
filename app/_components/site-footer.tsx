import Link from "next/link";

import { BrandMark } from "./brand-mark";

// Footer link groups. Every href is a real route; the account pages
// (wishlist, account, orders, cart) keep their existing guard and send
// signed-out visitors to sign in first, exactly as the header's links do.
const GROUPS = [
  {
    title: "Shop",
    links: [
      { href: "/products", label: "Products" },
      { href: "/categories", label: "Categories" },
      { href: "/wishlist", label: "Wishlist" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/account", label: "My Account" },
      { href: "/orders", label: "Orders" },
      { href: "/cart", label: "Cart" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/faqs", label: "FAQs" },
      { href: "/contact", label: "Contact Us" },
      { href: "/shipping", label: "Shipping Policy" },
      { href: "/returns", label: "Return & Refund Policy" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/payment-policy", label: "Payment Policy" },
    ],
  },
] as const;

// Closing section of every page. Its warm stone/graphite surface, hairline
// top highlight and text colors are footer-local (.site-footer in
// app/globals.css), so the global theme tokens stay untouched.
export function SiteFooter() {
  return (
    <footer className="site-footer mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:py-16 md:grid-cols-4 lg:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))] lg:gap-x-8">
          <div className="col-span-2 flex max-w-sm flex-col gap-4 md:col-span-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 self-start rounded-md text-lg font-bold tracking-tight">
              <BrandMark className="size-7" />
              Nexora
            </Link>
            <p className="site-footer-muted text-[0.9375rem] leading-relaxed text-pretty">
              Modern commerce built around simpler discovery, thoughtful shopping tools and products for everyday life.
            </p>
            <Link href="/about" className="site-footer-link self-start text-sm">
              About Nexora <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          {GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-4">
              <p className="site-footer-heading">{group.title}</p>
              <ul className="flex flex-col gap-2.5 text-sm">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="site-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        {/* pb-20 keeps the last line clear of the fixed AI Shopping
            Assistant launcher (bottom-right, up to 68px tall incl. offset). */}
        <div className="site-footer-bottom flex flex-col gap-2 pt-6 pb-20 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nexora Commerce. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Crafted for effortless shopping
          </p>
        </div>
      </div>
    </footer>
  );
}
