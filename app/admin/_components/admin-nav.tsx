"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ActiveIndicator } from "@/app/_components/motion/active-indicator";

// One admin section tab. The nav list itself stays in the (server) admin
// layout; only the current-section state needs the client pathname.
// Dashboard (/admin) is current only on itself; every other section also
// covers its sub-pages.
export function AdminNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const current =
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative block border-b-2 border-transparent py-3 text-sm font-medium transition-colors ${
        current ? "text-foreground" : "text-muted hover:border-input hover:text-foreground"
      }`}
    >
      {current && <ActiveIndicator layoutId="admin-nav-current" className="inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-foreground" />}
      {children}
    </Link>
  );
}
