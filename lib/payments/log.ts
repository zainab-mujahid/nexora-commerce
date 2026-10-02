import "server-only";

// Structured payment logging, same JSON-lines approach as lib/ai/log.ts.
//
// TRUST RULE: fields are limited to the keys below — internal identifiers,
// provider slug, generic statuses, closed-set codes and counts. Never a
// secret key, an Authorization header, a webhook body, a provider response,
// card data, an email, a name, an address or a free-form message. Every
// payment call site logs through this module.
export type PaymentLogFields = {
  paymentId?: string;
  checkoutSessionId?: string;
  orderId?: string;
  provider?: string;
  status?: string;
  outcome?: string;
  code?: string;
  dbCode?: string;
  issues?: string;
  eventType?: string;
  reused?: boolean;
  attempts?: number;
  summary?: string;
  refundId?: string;
};

export function logPaymentEvent(level: "info" | "warn" | "error", event: string, fields: PaymentLogFields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), scope: "payments", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
