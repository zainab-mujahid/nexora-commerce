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
  // Temporary, opt-in: plain HTTP on a bare IPv4 host (an EC2 public IP
  // without TLS), for Safepay SANDBOX testing only. Off unless explicitly
  // enabled; never applies to any other provider or environment.
  const sandboxHttpIp =
    process.env.APP_BASE_URL_ALLOW_HTTP === "true" &&
    process.env.PAYMENT_PROVIDER === "safepay" &&
    process.env.SAFEPAY_ENVIRONMENT === "sandbox" &&
    /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname);
  if (!(url.protocol === "https:" || ((local || sandboxHttpIp) && url.protocol === "http:")) || url.pathname !== "/" || url.search || url.hash) {
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
