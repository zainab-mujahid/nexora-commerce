import Link from "next/link";
import type { ReactNode } from "react";

// Consistent admin page header: optional back link, title (children),
// optional supporting line, and an optional action on the right.
// Presentation only. The title is passed as children so it stays part of
// the page's own element tree (server-render tests read it from there).
// The back link is a plain <a> (not a <nav>): the admin section nav is the
// only navigation landmark inside admin pages.
export function AdminPageHeader({
  children,
  description,
  back,
  action,
}: {
  children: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
          <span aria-hidden="true">&larr;</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="eyebrow">Admin workspace</span>
          <h1 className="display-title text-2xl sm:text-3xl">{children}</h1>
          {description && <p className="text-sm text-muted [overflow-wrap:anywhere]">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
