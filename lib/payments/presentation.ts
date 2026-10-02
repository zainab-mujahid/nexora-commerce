import "server-only";

import { isPaymentError } from "./errors";
import { logPaymentEvent } from "./log";
import { getActivePaymentProvider } from "./registry";
import { getProviderReturnUrls } from "./server/app-url";

// What the storefront may know about online payment: whether it is available,
// the provider's display name and whether it runs in test mode. No keys,
// hosts or configuration details ever leave this module.
export type PaymentAvailability =
  | { available: true; providerLabel: string; testMode: boolean }
  | { available: false };

const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({ safepay: "Safepay" });

export function getPaymentAvailability(): PaymentAvailability {
  try {
    const provider = getActivePaymentProvider();
    getProviderReturnUrls(provider.name); // also requires APP_BASE_URL
    return {
      available: true,
      providerLabel: PROVIDER_LABELS[provider.name] ?? provider.name,
      testMode: provider.environment === "sandbox",
    };
  } catch (error) {
    logPaymentEvent("warn", "payments_unavailable", {
      code: isPaymentError(error) ? error.code : "unknown",
      dbCode: isPaymentError(error) ? error.details.dbCode : undefined,
    });
    return { available: false };
  }
}
