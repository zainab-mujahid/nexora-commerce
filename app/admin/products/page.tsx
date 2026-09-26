import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
import { getProductEmbeddingStatuses } from "@/lib/ai/product-embedding-status";
import { formatPrice } from "@/lib/catalog/format";
import { getAdminProducts } from "@/lib/catalog/products";

import { SearchIndexStatus, type SearchIndexDisplayStatus } from "./search-index-status";
import { ToggleActiveButton } from "./toggle-active-button";

export const metadata: Metadata = {
  title: "Products",
};

// Search-index statuses for exactly the listed products, in one bulk read
// (no per-row queries, no vectors, no Gemini). Any failure only costs the
// status column — every product then shows "Unavailable" — never the page.
async function loadSearchIndexStatuses(
  productIds: string[],
): Promise<Map<string, SearchIndexDisplayStatus>> {
  const display = new Map<string, SearchIndexDisplayStatus>();
  try {
    const result = await getProductEmbeddingStatuses(productIds);
    if (!result.ok) return display;
    for (const [id, entry] of result.statuses) {
      display.set(id, entry.status ?? "unavailable");
    }
  } catch (error) {
    console.error("AdminProductsPage: failed to load search index statuses", error);
  }
  return display;
}

export default async function AdminProductsPage() {
  const products = await getAdminProducts();
  const searchIndex = await loadSearchIndexStatuses(products.map((product) => product.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Link
          href="/admin/products/new"
          className="btn btn-primary"
        >
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <EmptyState message="No products yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Search index</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}>
                  <td className="font-medium">{product.name}</td>
                  <td className="text-muted">
                    {product.category?.name ?? "—"}
                  </td>
                  <td>{formatPrice(product.price)}</td>
                  <td>{product.stock}</td>
                  <td>
                    <span
                      className={
                        product.is_active
                          ? "badge badge-success"
                          : "badge"
                      }
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <SearchIndexStatus
                      productId={product.id}
                      status={searchIndex.get(product.id) ?? "unavailable"}
                    />
                  </td>
                  <td>
                    <div className="flex gap-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="link-action"
                      >
                        Edit
                      </Link>
                      <ToggleActiveButton
                        productId={product.id}
                        isActive={product.is_active}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
