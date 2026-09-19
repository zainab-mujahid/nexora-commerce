const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// price/unit_price columns come back from PostgREST as strings (Postgres
// numeric -> JSON would otherwise lose precision) — always parse through
// this rather than trusting the value is already a number. A plain number
// is also accepted for values computed in application code, such as a cart
// line/subtotal total.
export function formatPrice(price: string | number): string {
  return currencyFormatter.format(Number(price));
}
