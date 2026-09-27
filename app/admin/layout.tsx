import { requireAdmin } from "@/lib/auth/dal";

import { AdminNavLink } from "./_components/admin-nav";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/maintenance", label: "Maintenance" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Re-verifies the session and admin role at the DAL layer (getProfile(),
  // itself gated by RLS's is_admin() check on profiles) — proxy.ts's cookie
  // check is only optimistic. Every future admin page nests under this
  // layout, so this one guard covers all of them without repeating it.
  await requireAdmin();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      {/* Section tabs; scrolls sideways on narrow screens instead of wrapping.
          The bottom rule is an inset shadow (not a border) so the active
          tab's underline can sit on it without overflowing the nav and
          triggering a vertical scrollbar. */}
      <nav aria-label="Admin" className="-mx-4 overflow-x-auto overflow-y-hidden px-4 shadow-[inset_0_-1px_0_var(--border)] sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-6">
          {ADMIN_NAV.map((item) => (
            <li key={item.href}>
              <AdminNavLink href={item.href}>{item.label}</AdminNavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </main>
  );
}
