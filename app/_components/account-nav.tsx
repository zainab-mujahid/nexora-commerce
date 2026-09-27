"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Links to the existing customer-account routes only. Account is current
// only on /account itself; Addresses and Orders also cover their sub-pages.
const ITEMS = [
  { href: "/account", label: "Account", match: (p: string) => p === "/account" },
  { href: "/account/addresses", label: "Addresses", match: (p: string) => p.startsWith("/account/addresses") },
  { href: "/orders", label: "Orders", match: (p: string) => p === "/orders" || p.startsWith("/orders/") },
];

export function AccountNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
        {ITEMS.map((item) => {
          const current = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`block rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  current
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-fill hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
