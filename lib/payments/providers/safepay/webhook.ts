import { createHmac, timingSafeEqual } from "node:crypto";

import type { ParsedProviderEvent } from "../../types";

// Safepay webhook authentication and parsing. Pure (no I/O).
//
// Signature scheme, verified against real deliveries from the Safepay
// sandbox (Test Webhook API, events payment.succeeded / payment.failed):
//   header  X-SFPY-SIGNATURE
//   value   lowercase hex HMAC-SHA512
//   key     the endpoint's shared secret, used as its UTF-8 string bytes
//   input   the RAW request body bytes, exactly as received
// (The older @sfpy/node-sdk signs JSON.stringify(body.data) — that does NOT
// match real deliveries.)
//
// Payload (version 2.0.0): { token: "evt_…", version, merchant_api_key,
// type, endpoint, data: { tracker: "track_…", metadata?: { order_id } | null,
// state, … }, created_at }.
//
// An authentic event is only a HINT naming a tracker; nothing here decides
// whether anything was paid.

const SIGNATURE_HEADER = "x-sfpy-signature";
const EVENT_ID = /^evt_[0-9a-f-]{36}$/;
const TRACKER = /^track_[0-9a-f-]{36}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_.]{0,99}$/;

export function verifySafepaySignature(rawBody: string, signatureHeader: string | null, webhookSecret: string): boolean {
  if (!signatureHeader) return false;
  const given = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(given)) return false;
  const expected = createHmac("sha512", Buffer.from(webhookSecret, "utf8")).update(Buffer.from(rawBody, "utf8")).digest("hex");
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}

function unauthentic(reason: string, body: Record<string, unknown> | null): ParsedProviderEvent {
  // Claimed values are untrusted and only used to label the audit record.
  const claimedEventId = typeof body?.token === "string" && EVENT_ID.test(body.token) ? body.token : null;
  const claimedEventType = typeof body?.type === "string" && EVENT_TYPE.test(body.type) ? body.type : null;
  return { authentic: false, reason, claimedEventId, claimedEventType };
}

export function parseSafepayEvent(
  input: { rawBody: string; headers: Headers },
  config: { webhookSecret: string; apiKey: string },
): ParsedProviderEvent {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(input.rawBody);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }

  const signature = input.headers.get(SIGNATURE_HEADER);
  if (!signature) return unauthentic("missing_signature", body);
  if (!verifySafepaySignature(input.rawBody, signature, config.webhookSecret)) return unauthentic("bad_signature", body);

  // Signed by Safepay from here on; still validate before trusting fields.
  if (!body) return unauthentic("malformed_body", null);
  if (body.merchant_api_key !== config.apiKey) return unauthentic("merchant_mismatch", body);
  if (typeof body.token !== "string" || !EVENT_ID.test(body.token)) return unauthentic("malformed_event_id", body);
  if (typeof body.type !== "string" || !EVENT_TYPE.test(body.type)) return unauthentic("malformed_event_type", body);

  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const tracker = typeof data.tracker === "string" && TRACKER.test(data.tracker) ? data.tracker : null;
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : null;
  const orderId = typeof metadata?.order_id === "string" && metadata.order_id.length <= 255 ? metadata.order_id : null;

  return {
    authentic: true,
    hint: { eventId: body.token, eventType: body.type, providerPaymentId: tracker, reference: orderId },
  };
}
