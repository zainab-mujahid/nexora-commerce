"use client";

import { toggleProductActive } from "@/lib/admin/products";

export function ToggleActiveButton({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  return (
    <form action={toggleProductActive.bind(null, productId, !isActive)}>
      <button type="submit" className="hover:opacity-70">
        {isActive ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}
