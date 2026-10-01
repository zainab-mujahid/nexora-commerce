import Link from "next/link";

import { BrandMark } from "./brand-mark";

// Closing section of every page. Its warm stone/graphite surface, hairline
// top highlight and text colors are footer-local (.site-footer in
// app/globals.css), so the global theme tokens stay untouched.
export function SiteFooter() {
  return (
    <footer className="site-footer mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6">
        <div className="grid gap-10 py-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-16 sm:py-16">
          <div className="flex max-w-md flex-col gap-4">
            <span className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <BrandMark className="size-7" />
              Nexora
            </span>
            <p className="site-footer-muted text-[0.9375rem] leading-relaxed text-pretty">
              Everyday products, thoughtfully curated — with an AI shopping assistant to help you find the right one.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-4 sm:min-w-40">
            <p className="site-footer-heading">Explore</p>
            <ul className="flex gap-6 text-sm sm:flex-col sm:gap-3">
              <li>
                <Link href="/" className="site-footer-link">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/products" className="site-footer-link">
                  Shop
                </Link>
              </li>
            </ul>
          </nav>
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
