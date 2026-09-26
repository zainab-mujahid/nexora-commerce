// Badge styling for an order status, shared by the customer and admin order
// views so a status always reads the same everywhere. Display only.
const ORDER_STATUS_BADGE: Record<string, string> = {
  pending: "badge",
  processing: "badge badge-info",
  shipped: "badge badge-warning",
  delivered: "badge badge-success",
  cancelled: "badge badge-danger",
};

export function orderStatusBadgeClass(status: string): string {
  return ORDER_STATUS_BADGE[status] ?? "badge";
}
