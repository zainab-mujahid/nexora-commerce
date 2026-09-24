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
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <EmptyState message="No products yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-foreground/60 dark:border-white/10">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">Stock</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Search index</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-4">{product.name}</td>
                  <td className="py-2 pr-4 text-foreground/60">
                    {product.category?.name ?? "—"}
                  </td>
                  <td className="py-2 pr-4">{formatPrice(product.price)}</td>
                  <td className="py-2 pr-4">{product.stock}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        product.is_active
                          ? "text-green-600"
                          : "text-foreground/50"
                      }
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <SearchIndexStatus
                      productId={product.id}
                      status={searchIndex.get(product.id) ?? "unavailable"}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="hover:opacity-70"
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
