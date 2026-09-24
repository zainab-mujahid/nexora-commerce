import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/dal";

import { EntryCard } from "./_components/entry-card";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Admin dashboard
        </h1>
        <p className="text-sm text-foreground/60">
          Signed in as {admin.full_name?.trim() || "Admin"}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EntryCard
          href="/admin/products"
          title="Products"
          description="Create, edit, and (de)activate products."
        />
        <EntryCard
          href="/admin/categories"
          title="Categories"
          description="Manage the catalog's categories."
        />
        <EntryCard
          href="/admin/orders"
          title="Orders"
          description="Review orders and update their status."
        />
        <EntryCard
          href="/admin/maintenance"
          title="Maintenance"
          description="Check and repair the product search index."
        />
      </div>
    </div>
  );
}
