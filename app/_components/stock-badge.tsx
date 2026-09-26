import type { ReactNode } from "react";

const LOW_STOCK_THRESHOLD = 5;

// Same thresholds and wording as before; only the presentation (a small
// status dot + label) is styled here.
function StockLabel({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <StockLabel tone="text-danger">Out of stock</StockLabel>;
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return <StockLabel tone="text-warning">Low stock — {stock} left</StockLabel>;
  }

  return <StockLabel tone="text-success">In stock</StockLabel>;
}
