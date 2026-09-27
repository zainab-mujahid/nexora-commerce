"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Wraps the header's (server-rendered) search form and only decides whether
// it shows: /products — with or without ?q=/filters — has its own search
// form, so the header's is left out there and the page has one search
// interface. No search logic lives here; the form is passed through as is.
export function HeaderSearchSlot({ children, className }: { children: ReactNode; className: string }) {
  const pathname = usePathname();
  if (pathname === "/products") return null;
  return <div className={className}>{children}</div>;
}
