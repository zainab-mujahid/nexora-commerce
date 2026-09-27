"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

  const base =
    variant === "bar"
      ? "inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium transition-colors"
      : "flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors";
  const state = current
    ? "bg-fill text-foreground"
    : "text-muted hover:bg-fill hover:text-foreground";

  return (
    <Link href={href} aria-current={current ? "page" : undefined} title={title} className={`${base} ${state}`}>
      {children}
    </Link>
  );
}
