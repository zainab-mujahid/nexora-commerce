import "server-only";

import { PaymentError } from "../errors";

// Absolute public origin of this deployment, for URLs handed to a payment
// provider (where to send the customer back). Read from APP_BASE_URL — never
// derived from the request's Host/X-Forwarded-* headers, which a client can
// influence.
export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim();
  if (!raw) throw new PaymentError("configuration", { dbCode: "APP_BASE_URL_MISSING" });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentError("configuration", { dbCode: "APP_BASE_URL_INVALID" });
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (local && url.protocol === "http:")) || url.pathname !== "/" || url.search || url.hash) {
    throw new PaymentError("configuration", { dbCode: "APP_BASE_URL_INVALID" });
  }
  return url.origin;
}

// Where the provider sends the customer after paying / leaving its page.
export function getProviderReturnUrls(provider: string): { returnUrl: string; cancelUrl: string } {
  const base = getAppBaseUrl();
  return {
    returnUrl: `${base}/payments/${provider}/return`,
    cancelUrl: `${base}/payments/${provider}/cancel`,
  };
}
