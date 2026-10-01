import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "@/lib/supabase/env";

import { PaymentError } from "../errors";

// Privileged Supabase client for the payment layer ONLY, authenticated with
// the server-side secret key (sb_secret_…, maps to the service_role role).
//
// What this key can do is deliberately narrow (see Payments P1 in
// supabase/schema.sql): SELECT on the four payment tables, and EXECUTE on the
// server-only payment functions. It cannot write any table directly and has
// no access to orders/products/profiles/addresses/cart — so it must only be
// used through lib/payments/server/store.ts, never for general queries.
//
// The key is read lazily (on first use), so importing payment code never
// breaks pages when payments aren't configured; the failure surfaces as a
// PaymentError('configuration') at the point of use. The key value never
// appears in an error, a log line or a client bundle.
//
// A single cached instance is fine here, unlike lib/supabase/server.ts: this
// client carries no user session, so there is nothing per-visitor to leak.
let cachedClient: SupabaseClient | null = null;

export function getPaymentsAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new PaymentError("configuration", { dbCode: "SUPABASE_SECRET_KEY_MISSING" });
  }
  // Only the current secret-key format. The legacy service_role JWT is being
  // retired by Supabase and is deliberately not accepted here.
  if (!secretKey.startsWith("sb_secret_")) {
    throw new PaymentError("configuration", { dbCode: "SUPABASE_SECRET_KEY_INVALID_FORMAT" });
  }

  cachedClient = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedClient;
}
