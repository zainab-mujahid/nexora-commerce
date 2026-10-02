import "server-only";

import { PaymentError } from "../../errors";

// Validated Safepay configuration. Server-only; values are read lazily (on
// first use) so importing payment code never breaks pages when Safepay isn't
// configured, and no value ever appears in an error or a log line.
//
// SANDBOX ONLY for now: anything other than SAFEPAY_ENVIRONMENT=sandbox fails
// closed. Hosts are explicit constants — never derived from configuration and
// never left to the SDK's default (which points at live).
export const SAFEPAY_SANDBOX = Object.freeze({
  environment: "sandbox" as const,
  apiHost: "https://sandbox.api.getsafepay.com",
  checkoutOrigin: "https://sandbox.api.getsafepay.com",
  checkoutPath: "/embedded/",
});

// Per-request timeout for Safepay API calls. Safepay retries webhooks that
// aren't acknowledged within 10 s, so a webhook's own lookup must finish well
// inside that.
export const SAFEPAY_REQUEST_TIMEOUT_MS = 8000;

export type SafepayConfig = {
  environment: "sandbox";
  apiHost: string;
  checkoutOrigin: string;
  checkoutPath: string;
  // "Public API Key" (sec_…): identifies the merchant account; sent when
  // creating a payment and compared against lookups/webhooks.
  apiKey: string;
  // "Private API Secret Key": authenticates server-side API requests.
  secretKey: string;
  // Endpoint "shared secret": HMAC key for webhook signatures.
  webhookSecret: string;
};

let cached: SafepayConfig | null = null;

function fail(dbCode: string): never {
  throw new PaymentError("configuration", { provider: "safepay", dbCode });
}

export function getSafepayConfig(): SafepayConfig {
  if (cached) return cached;

  const environment = process.env.SAFEPAY_ENVIRONMENT;
  const apiKey = process.env.SAFEPAY_API_KEY;
  const secretKey = process.env.SAFEPAY_SECRET_KEY;
  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;

  if (environment !== "sandbox") fail(environment ? "SAFEPAY_ENVIRONMENT_NOT_SANDBOX" : "SAFEPAY_ENVIRONMENT_MISSING");
  if (!apiKey) fail("SAFEPAY_API_KEY_MISSING");
  if (!/^sec_[0-9a-f-]{36}$/i.test(apiKey)) fail("SAFEPAY_API_KEY_INVALID_FORMAT");
  if (!secretKey) fail("SAFEPAY_SECRET_KEY_MISSING");
  if (!/^[0-9a-f]{64}$/i.test(secretKey)) fail("SAFEPAY_SECRET_KEY_INVALID_FORMAT");
  if (!webhookSecret) fail("SAFEPAY_WEBHOOK_SECRET_MISSING");
  if (webhookSecret.length < 32) fail("SAFEPAY_WEBHOOK_SECRET_INVALID_FORMAT");

  cached = Object.freeze({ ...SAFEPAY_SANDBOX, apiKey, secretKey, webhookSecret });
  return cached;
}
