import Link from "next/link";

import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <span className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <BrandMark className="size-6" />
              Nexora
            </span>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Everyday products, thoughtfully curated — with an AI shopping assistant to help you find the right one.
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <Link href="/" className="nav-link">
              Home
            </Link>
            <Link href="/products" className="nav-link">
              Shop
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
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
