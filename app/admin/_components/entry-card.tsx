import Link from "next/link";
import type { ReactNode } from "react";

// Dashboard section card. Keeps `rounded-md border` on the link (existing
// browser tests locate dashboard cards by `main a.rounded-md.border`).
export function EntryCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="card card-interactive group flex flex-col gap-4 rounded-md border p-5"
    >
      <span className="flex items-center justify-between">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-md bg-fill text-muted transition-colors group-hover:bg-foreground group-hover:text-background">
          {icon}
        </span>
        <span aria-hidden="true" className="text-subtle transition-transform group-hover:translate-x-0.5">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="M4 10h12m-5-5 5 5-5 5" />
          </svg>
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </span>
    </Link>
  );
}
