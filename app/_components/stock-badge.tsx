const LOW_STOCK_THRESHOLD = 5;

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="text-xs font-medium text-danger">Out of stock</span>
    );
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return (
      <span className="text-xs font-medium text-warning">
        Low stock — {stock} left
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-success">In stock</span>
  );
}
