import Link from "next/link";

import { requireAdmin } from "@/lib/auth/dal";

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <nav className="flex flex-wrap gap-4 border-b border-black/10 pb-3 text-sm font-medium dark:border-white/10">
        {ADMIN_NAV.map((item) => (
          <Link key={item.href} href={item.href} className="hover:opacity-70">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
