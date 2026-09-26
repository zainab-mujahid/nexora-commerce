import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import {
  getProductEmbeddingStatuses,
  summarizeProductEmbeddingStatuses,
  type ProductSearchIndexHealth,
} from "@/lib/ai/product-embedding-status";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminProducts } from "@/lib/catalog/products";

import {
  SearchIndexStatus,
  type SearchIndexDisplayStatus,
} from "../products/search-index-status";

import { RepairSearchIndexButton } from "./repair-search-index-button";

export const metadata: Metadata = {
  title: "Maintenance",
};

// Search-index statuses for every listed product from ONE bulk status read
// (no per-row queries, no vectors, no Gemini); the summary counts come from
// the same map. A failed read only costs the status data — rows then show
// "Unavailable" and the counts are replaced by a notice — never the page.
async function loadSearchIndex(productIds: string[]): Promise<{
  display: Map<string, SearchIndexDisplayStatus>;
  health: ProductSearchIndexHealth | null;
}> {
  const display = new Map<string, SearchIndexDisplayStatus>();
  try {
    const result = await getProductEmbeddingStatuses(productIds);
    if (!result.ok) return { display, health: null };
    for (const [id, entry] of result.statuses) {
      display.set(id, entry.status ?? "unavailable");
    }
    return { display, health: summarizeProductEmbeddingStatuses(result.statuses) };
  } catch (error) {
    console.error("AdminMaintenancePage: failed to load search index statuses", error);
    return { display, health: null };
  }
}

// Display order only (the statuses themselves come from Phase C): products
// needing attention first, then ones whose status couldn't be determined,
// then up to date.
const ORDER_GROUP: Record<SearchIndexDisplayStatus, number> = {
  missing: 0,
  repair_failed: 0,
  out_of_date: 0,
  unavailable: 1,
  up_to_date: 2,
};

export default async function AdminMaintenancePage() {
  // Checked here, not only in app/admin/layout.tsx: a layout isn't
  // re-rendered on client-side navigation, so the page guards its own data.
  await requireAdmin();

  const products = await getAdminProducts();
  const { display, health } = await loadSearchIndex(products.map((product) => product.id));

  const rows = products
    .map((product) => ({ product, status: display.get(product.id) ?? "unavailable" }))
    .sort(
      (a, b) =>
        ORDER_GROUP[a.status] - ORDER_GROUP[b.status] ||
        a.product.name.localeCompare(b.product.name, "en") ||
        (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0),
    );

  const counts: { label: string; value: number }[] = health
    ? [
        { label: "Up to date", value: health.upToDate },
        { label: "Missing", value: health.missing },
        { label: "Out of date", value: health.outOfDate },
        { label: "Repair failed", value: health.repairFailed },
        ...(health.unresolved > 0 ? [{ label: "Unavailable", value: health.unresolved }] : []),
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>

      <section aria-labelledby="search-index-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="search-index-heading" className="text-lg font-semibold tracking-tight">
            Product search index
          </h2>
          <p className="text-sm text-muted">
            Semantic search and the shopping assistant use each product&apos;s
            search index. Products that need attention are listed first.
          </p>
        </div>

        {health ? (
          <>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {counts.map((count) => (
                <div
                  key={count.label}
                  className="flex flex-col gap-1 card p-4"
                >
                  <dt className="text-sm text-muted">{count.label}</dt>
                  <dd className="text-2xl font-semibold tracking-tight">{count.value}</dd>
                </div>
              ))}
            </dl>
            {/* Offered only when the canonical status summary is known; it
                is disabled when nothing needs repair. */}
            <RepairSearchIndexButton needsAttention={health.needsAttention} />
          </>
        ) : (
          products.length > 0 && (
            <p className="text-sm text-muted">
              Search index status is unavailable right now.
            </p>
          )
        )}

        {products.length === 0 ? (
          <EmptyState message="No products yet." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Search index</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product, status }) => (
                  <tr
                    key={product.id}>
                    <td className="font-medium">{product.name}</td>
                    <td className="text-muted">
                      {product.category?.name ?? "—"}
                    </td>
                    <td>
                      <span
                        className={
                          product.is_active ? "badge badge-success" : "badge"
                        }
                      >
                        {product.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <SearchIndexStatus productId={product.id} status={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
