"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ActiveIndicator } from "./motion/active-indicator";

// A global-header link with a reliable current-page state (from the client
// pathname; the header itself is a server component). "exact" links are
// current only on their own path; the others also cover sub-pages.
// Presentation only: it renders a plain <Link>.
export function HeaderNavLink({
  href,
  children,
  exact = false,
  variant = "bar",
  title,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  variant?: "bar" | "row";
  title?: string;
}) {
  const pathname = usePathname() ?? "";
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // Desktop bar: the current page's pill is a shared-layout indicator that
  // glides to the new link on navigation. The stacked menu rows keep a plain
  // background (they're only visible while the menu is open).
  if (variant === "bar") {
    return (
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        title={title}
        className={`relative isolate inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium transition-colors ${
          current ? "text-foreground" : "text-muted hover:bg-fill hover:text-foreground"
        }`}
      >
        {current && <ActiveIndicator layoutId="header-nav-current" className="inset-0 -z-10 rounded-md bg-fill" />}
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      title={title}
      className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${
        current ? "bg-fill text-foreground" : "text-muted hover:bg-fill hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
