import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/dal";

import { AdminPageHeader } from "./_components/admin-page-header";
import { EntryCard } from "./_components/entry-card";

export const metadata: Metadata = {
  title: "Admin",
};

const icon = (d: string) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
    <path d={d} />
  </svg>
);

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        description={`Signed in as ${admin.full_name?.trim() || "Admin"}.`}
      >
        Admin dashboard
      </AdminPageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EntryCard
          href="/admin/products"
          title="Products"
          description="Create, edit, and (de)activate products."
          icon={icon("M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Zm0 0L10 10l7-3.5M10 10v7")}
        />
        <EntryCard
          href="/admin/categories"
          title="Categories"
          description="Manage the catalog's categories."
          icon={icon("M3 4h5v5H3V4Zm9 0h5v5h-5V4ZM3 11h5v5H3v-5Zm9 0h5v5h-5v-5Z")}
        />
        <EntryCard
          href="/admin/orders"
          title="Orders"
          description="Review orders and update their status."
          icon={icon("M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3Zm3 4h4m-4 3h4")}
        />
        <EntryCard
          href="/admin/maintenance"
          title="Maintenance"
          description="Check and repair the product search index."
          icon={icon("M12.5 3.5a4 4 0 0 0-4.7 5.4L3.5 13.2a1.5 1.5 0 0 0 2.1 2.1l4.3-4.3a4 4 0 0 0 5.4-4.7l-2.4 2.4-2-.5-.5-2 2.4-2.4Z")}
        />
      </div>
    </div>
  );
}
