import { after } from "next/server";

import { isPaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getPaymentServiceForProvider } from "@/lib/payments/service";

// Safepay webhook endpoint (server-to-server; no browser session involved).
//
// The raw body is read as bytes and handed over unmodified: Safepay signs the
// exact request bytes (HMAC-SHA512, X-SFPY-SIGNATURE), so nothing may parse or
// re-serialize it before verification. An authentic event is only a hint —
// the payment service re-fetches the tracker from Safepay before anything
// changes, and only a verified exact USD payment can create an order.
//
// Responses carry no details. 401 for unauthentic requests; 200 for every
// authentic delivery once it is durably recorded — including duplicates.
// Safepay treats anything not acknowledged within 10 s as failed, and the
// authoritative verification (provider lookup + database finalize) can take
// longer, so it runs AFTER the response via after() (Safepay's own guidance:
// store the event, acknowledge, then apply business logic). If that work
// fails or the process stops, the event stays recorded (outcome 'error' /
// unprocessed) for reconciliation, and the customer's return page performs
// the same idempotent verification anyway. 503 when payments aren't
// configured, so Safepay retries later.

const MAX_BODY_BYTES = 64 * 1024;

// Best-effort, per-instance throttle for unauthentic traffic (forged or
// misconfigured senders). Authentic Safepay deliveries are never limited.
const REJECT_WINDOW_MS = 60_000;
const REJECT_LIMIT = 20;
const rejected = new Map<string, { windowStart: number; count: number }>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isThrottled(key: string, now: number): boolean {
  const entry = rejected.get(key);
  return !!entry && now - entry.windowStart < REJECT_WINDOW_MS && entry.count >= REJECT_LIMIT;
}

function noteRejected(key: string, now: number): void {
  const entry = rejected.get(key);
  if (!entry || now - entry.windowStart >= REJECT_WINDOW_MS) rejected.set(key, { windowStart: now, count: 1 });
  else entry.count += 1;
  if (rejected.size > 1000) {
    for (const [k, v] of rejected) if (now - v.windowStart >= REJECT_WINDOW_MS) rejected.delete(k);
  }
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  const key = clientKey(request);
  if (isThrottled(key, now)) return json(429, { received: false });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { received: false });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) return json(400, { received: false });

  // Strict UTF-8 decode: invalid bytes would not survive the string round
  // trip the signature check relies on.
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    noteRejected(key, now);
    return json(400, { received: false });
  }

  try {
    const service = getPaymentServiceForProvider("safepay");
    const received = await service.receiveProviderEvent({ rawBody, headers: request.headers });
    if (received.kind === "rejected") {
      noteRejected(key, now);
      return json(401, { received: false });
    }
    if (received.kind === "accepted") {
      after(async () => {
        const result = await service.processProviderEvent(received);
        logPaymentEvent(result.kind === "error" ? "error" : "info", "webhook_processed", { provider: "safepay", outcome: result.kind, eventType: received.eventType });
      });
    }
    return json(200, { received: true });
  } catch (error) {
    const code = isPaymentError(error) ? error.code : "unknown";
    logPaymentEvent("error", "webhook_route_failed", { provider: "safepay", code });
    // Configuration/database trouble: let Safepay retry later.
    return json(code === "configuration" ? 503 : 500, { received: false });
  }
}
