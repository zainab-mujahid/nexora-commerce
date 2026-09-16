const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// price/unit_price/subtotal columns come back from PostgREST as strings
// (Postgres numeric -> JSON would otherwise lose precision) — always parse
// through this rather than trusting the value is already a number.
export function formatPrice(price: string): string {
  return currencyFormatter.format(Number(price));
}
