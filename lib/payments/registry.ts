import "server-only";

import { PaymentError } from "./errors";
import type { PaymentProvider } from "./provider";
import { createSafepayProvider } from "./providers/safepay";

// Server-only provider registry. PAYMENT_PROVIDER names the adapter used for
// NEW checkouts; it must match a registered key exactly. There is no default
// and no fallback: a missing, unknown or not-yet-implemented provider fails
// closed with a configuration error.
//
// Adapters are registered here as lazy factories so a provider's
// credentials are only read when that provider is actually used. Test fakes
// are never registered here — tests construct the payment service with their
// fake directly, so a fake can never be selected through configuration.
export type PaymentProviderFactory = () => PaymentProvider;
export type PaymentProviderFactories = Readonly<Record<string, PaymentProviderFactory>>;

const PROVIDER_FACTORIES: PaymentProviderFactories = Object.freeze({
  safepay: () => createSafepayProvider(),
});

export function resolvePaymentProvider(name: string | undefined, factories: PaymentProviderFactories): PaymentProvider {
  const providerName = name?.trim();
  if (!providerName) {
    throw new PaymentError("configuration", { dbCode: "PAYMENT_PROVIDER_NOT_SET" });
  }
  // Own-property lookup only, so names like "toString" or "__proto__" can
  // never resolve to something that isn't a registered adapter.
  const factory = Object.hasOwn(factories, providerName) ? factories[providerName] : undefined;
  if (!factory) {
    throw new PaymentError("configuration", { dbCode: "PAYMENT_PROVIDER_UNSUPPORTED", provider: providerName });
  }
  const provider = factory();
  if (provider.name !== providerName) {
    throw new PaymentError("configuration", { dbCode: "PAYMENT_PROVIDER_NAME_MISMATCH", provider: providerName });
  }
  return provider;
}

// The adapter for new checkouts, from PAYMENT_PROVIDER.
export function getActivePaymentProvider(): PaymentProvider {
  return resolvePaymentProvider(process.env.PAYMENT_PROVIDER, PROVIDER_FACTORIES);
}

// The adapter for an existing payment row (payments.provider), so history
// created under one provider stays verifiable after switching the active one.
export function getPaymentProviderByName(name: string): PaymentProvider {
  return resolvePaymentProvider(name, PROVIDER_FACTORIES);
}
