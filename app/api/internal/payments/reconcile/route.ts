import { createHash, timingSafeEqual } from "node:crypto";

import { isPaymentError } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/log";
import { getReconciliationService } from "@/lib/payments/reconciliation";

// Internal trigger for payment reconciliation (expired checkouts, recorded
// webhook events, refunds whose outcome is still open). Meant to be called by
// a scheduler on the server host — never by browsers. Protected by a
// dedicated server-only secret
// (PAYMENT_RECONCILE_SECRET, ≥ 32 chars) sent as `Authorization: Bearer …`
// and compared in constant time. With no secret configured the endpoint does
// not exist (404). Responses contain only outcome counts.

const MIN_SECRET_LENGTH = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Hashing first makes the comparison constant-time regardless of length.
  return presented.length > 0 && timingSafeEqual(digest(presented), digest(secret));
}

function boundedInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 50 ? value : fallback;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PAYMENT_RECONCILE_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return new Response(null, { status: 404 });
  if (!authorized(request, secret)) {
    logPaymentEvent("warn", "reconcile_unauthorized");
    return Response.json({ ok: false }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const result = await getReconciliationService().runReconciliation({
      checkoutLimit: boundedInt(body.checkoutLimit, 20),
      eventLimit: boundedInt(body.eventLimit, 20),
      refundLimit: boundedInt(body.refundLimit, 20),
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const code = isPaymentError(error) ? error.code : "unknown";
    logPaymentEvent("error", "reconcile_run_failed", { code });
    return Response.json({ ok: false }, { status: code === "configuration" ? 503 : 500 });
  }
}
