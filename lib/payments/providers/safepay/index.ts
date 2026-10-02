import "server-only";

import Safepay from "@sfpy/node-core";
import * as z from "zod";

import { PaymentError } from "../../errors";
import { minorToSafeInteger } from "../../money";
import type { PaymentProvider } from "../../provider";
import type { CreateProviderCheckoutInput, CreateProviderCheckoutResult, VerifiedProviderPayment } from "../../types";
import { getSafepayConfig, SAFEPAY_REQUEST_TIMEOUT_MS, type SafepayConfig } from "./config";
import { lookupResponseSchema, normalizeTracker, type SafepayTracker } from "./tracker";
import { parseSafepayEvent } from "./webhook";

// Safepay adapter (hosted "Express Checkout" flow) behind the generic
// PaymentProvider contract. Everything Safepay-specific — SDK, endpoints,
// tracker states, signature scheme — stays in lib/payments/providers/safepay.
//
// Flow, verified against the Safepay sandbox:
//   1. POST /order/payments/v3/            create a tracker (amount in minor
//      units, currency, metadata.order_id = Nexora's payment reference);
//   2. POST /client/passport/v1/token      short-lived checkout token ("tbt");
//   3. hosted checkout URL                 {checkout}/embedded/?tracker&tbt…
//   4. GET  /reporter/api/v1/payments/{tracker}  authoritative lookup.
// Resuming an existing tracker = a fresh token + URL for the SAME tracker.
//
// Uses @sfpy/node-core 0.3.5 (pinned). Its default host is LIVE and lacks a
// scheme, so the sandbox host is always passed explicitly.

export type SafepayClient = {
  payments: { session: { setup(params: unknown): Promise<unknown> } };
  client: { passport: { create(): Promise<unknown> } };
  reporter: { payments: { fetch(id: string): Promise<unknown> } };
  checkout: { createCheckoutUrl(params: Record<string, unknown>): string };
};

// The SDK's bundled typings don't describe its runtime shape; this module
// (server-only) narrows it to the four calls Nexora uses.
const createSdk = Safepay as unknown as SafepaySdkFactory;

export type SafepaySdkFactory = (key: string, opts: Record<string, unknown>) => SafepayClient;

// SDK/network failures -> generic errors. Safepay's message, status text and
// request details are kept only as a non-enumerable cause.
function providerError(error: unknown): PaymentError {
  if (error instanceof PaymentError) return error;
  const status = (error as { statusCode?: number })?.statusCode;
  if (status === 401 || status === 403) {
    return new PaymentError("configuration", { provider: "safepay", dbCode: "SAFEPAY_AUTH_REJECTED" }, { cause: error });
  }
  return new PaymentError("provider_unavailable", { provider: "safepay" }, { cause: error });
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw providerError(error);
  }
}

const setupResponseSchema = z.object({
  data: z.object({
    tracker: z.object({
      token: z.string().regex(/^track_[0-9a-f-]{36}$/),
      client: z.string(),
      environment: z.string(),
      state: z.string(),
      purchase_totals: z.object({ quote_amount: z.object({ currency: z.string(), amount: z.number().int() }) }),
    }),
    capabilities: z.record(z.string(), z.boolean()).optional(),
  }),
});
const passportSchema = z.object({ data: z.string().min(16).max(512) });

// Trackers that can still be paid on the hosted page.
const RESUMABLE_STATES = new Set(["TRACKER_STARTED", "TRACKER_ENROLLED"]);

// `overrides` exists for automated tests only (injecting a stub SDK client or
// a shorter timeout). The registry always calls this with no arguments.
export function createSafepayProvider(
  overrides: { config?: SafepayConfig; sdk?: SafepaySdkFactory; timeoutMs?: number } = {},
): PaymentProvider {
  const config = overrides.config ?? getSafepayConfig();
  const factory = overrides.sdk ?? createSdk;
  const timeout = overrides.timeoutMs ?? SAFEPAY_REQUEST_TIMEOUT_MS;
  const sdk = (cfg: SafepayConfig): SafepayClient =>
    factory(cfg.secretKey, { authType: "secret", host: cfg.apiHost, timeout });

  async function lookup(tracker: string): Promise<SafepayTracker> {
    const response = await call(() => sdk(config).reporter.payments.fetch(tracker));
    const parsed = lookupResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PaymentError("provider_malformed_response", { provider: "safepay", providerPaymentId: tracker }, { cause: parsed.error });
    }
    return parsed.data.data;
  }

  async function checkoutUrl(tracker: string, input: CreateProviderCheckoutInput): Promise<string> {
    const token = passportSchema.safeParse(await call(() => sdk(config).client.passport.create()));
    if (!token.success) throw new PaymentError("provider_malformed_response", { provider: "safepay", providerPaymentId: tracker });
    const url = sdk(config).checkout.createCheckoutUrl({
      env: config.environment,
      tbt: token.data.data,
      tracker,
      source: "hosted",
      order_id: input.reference,
      redirect_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    });
    const parsed = new URL(url);
    if (parsed.origin !== config.checkoutOrigin || parsed.pathname !== config.checkoutPath) {
      throw new PaymentError("provider_malformed_response", { provider: "safepay", dbCode: "SAFEPAY_UNEXPECTED_CHECKOUT_HOST" });
    }
    return url;
  }

  return {
    name: "safepay",
    environment: config.environment,

    async createCheckout(input): Promise<CreateProviderCheckoutResult> {
      if (input.money.currency !== "USD") throw new PaymentError("invalid_input", { provider: "safepay" });

      if (input.existingProviderPaymentId) {
        // Resume: same tracker, fresh checkout token. Only if Safepay still
        // has it open and it is unmistakably this payment.
        const tracker = await lookup(input.existingProviderPaymentId);
        const quote = tracker.purchase_totals.quote_amount;
        const sameIdentity =
          tracker.token === input.existingProviderPaymentId &&
          tracker.metadata?.order_id?.value === input.reference &&
          tracker.client?.api_key === config.apiKey &&
          tracker.environment === config.environment &&
          quote.currency === input.money.currency &&
          BigInt(quote.amount) === input.money.amountMinor;
        if (!sameIdentity) {
          throw new PaymentError("verification_mismatch", { provider: "safepay", providerPaymentId: tracker.token, dbCode: "SAFEPAY_RESUME_IDENTITY_MISMATCH" });
        }
        if (!RESUMABLE_STATES.has(tracker.state)) {
          throw new PaymentError("conflict", { provider: "safepay", providerPaymentId: tracker.token, dbCode: "SAFEPAY_TRACKER_NOT_RESUMABLE" });
        }
        return { providerPaymentId: tracker.token, redirectUrl: await checkoutUrl(tracker.token, input) };
      }

      // New tracker. Only the opaque Nexora reference goes to Safepay — no
      // customer, address or product data.
      const created = setupResponseSchema.safeParse(
        await call(() =>
          sdk(config).payments.session.setup({
            merchant_api_key: config.apiKey,
            intent: "CYBERSOURCE",
            mode: "payment",
            currency: input.money.currency,
            amount: minorToSafeInteger(input.money.amountMinor),
            metadata: { order_id: input.reference },
          }),
        ),
      );
      if (!created.success) throw new PaymentError("provider_malformed_response", { provider: "safepay" }, { cause: created.error });

      const tracker = created.data.data.tracker;
      const echoedOk =
        tracker.client === config.apiKey &&
        tracker.environment === config.environment &&
        tracker.state === "TRACKER_STARTED" &&
        tracker.purchase_totals.quote_amount.currency === input.money.currency &&
        BigInt(tracker.purchase_totals.quote_amount.amount) === input.money.amountMinor &&
        created.data.data.capabilities?.CYBERSOURCE !== false;
      if (!echoedOk) {
        // Never send a customer to a tracker that doesn't match exactly.
        throw new PaymentError("verification_mismatch", { provider: "safepay", providerPaymentId: tracker.token, dbCode: "SAFEPAY_SETUP_MISMATCH" });
      }

      return { providerPaymentId: tracker.token, redirectUrl: await checkoutUrl(tracker.token, input) };
    },

    async fetchPayment(input): Promise<VerifiedProviderPayment> {
      return normalizeTracker(await lookup(input.providerPaymentId), config);
    },

    async parseEvent(input) {
      return parseSafepayEvent(input, config);
    },
  };
}
