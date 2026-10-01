import "server-only";

import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import * as z from "zod";

import { createClient } from "@/lib/supabase/server";

import { logAiEvent } from "./log";

// Temporary conversation memory for the AI shopping assistant, kept in
// Upstash Redis. It only adds conversational continuity to the grounded
// recommendation call (lib/ai/recommend.ts) — e.g. so "which one has better
// battery life?" can be read against the previous answer. It is never product
// data: candidates still come from retrieval on every turn, and the
// structured ShoppingContext (lib/ai/context.ts) still drives the search.
//
// BEST-EFFORT by design. Missing configuration, a Redis error or a slow
// response all degrade to "no memory for this turn" — never to a failed
// assistant turn. Nothing here throws to its caller.
//
// Server-only: the REST token is read from a non-NEXT_PUBLIC_ variable and
// the client is never imported by client code.

// How long a conversation is remembered after its last turn. Every saved
// turn refreshes it, so an active conversation never expires mid-way, and an
// abandoned one disappears on its own.
export const AI_MEMORY_TTL_SECONDS = 30 * 60;

// Most recent exchanges (one customer message + the assistant's answer) kept
// per conversation. Older ones are trimmed on write, and this is also the
// most ever sent to Gemini, which bounds prompt size, Redis storage and how
// far back stale context can reach.
export const AI_MEMORY_MAX_TURNS = 5;

// A memory read/write that takes longer than this is abandoned and the turn
// continues without it. Reads start alongside intent extraction (seconds of
// work), so a healthy read never adds latency.
const AI_MEMORY_TIMEOUT_MS = 1500;

const KEY_PREFIX = "nexora:ai:session:";

// Guest conversations need an identity that isn't shared by every anonymous
// visitor. This is a random, opaque, httpOnly browser-session cookie issued by
// lib/ai/actions.ts on a guest's first assistant message — it is used for
// nothing but naming that browser's memory key and grants no access to
// anything else.
const GUEST_SESSION_COOKIE = "nexora-ai-session";

// Mirror the bounds the assistant already enforces (lib/ai/actions.ts input
// limit, lib/ai/recommend.ts message limit and MAX_RECOMMENDATIONS) so a
// stored turn can never be larger than a real one.
const MAX_STORED_USER_TEXT = 500;
const MAX_STORED_ASSISTANT_TEXT = 600;
const MAX_STORED_PRODUCT_NAMES = 5;
const MAX_STORED_PRODUCT_NAME = 100;

// What one remembered exchange holds: the customer's message, the
// assistant's validated reply, and the names of the products it recommended
// (so a follow-up like "the second one" has something to refer to). No user
// id, email, token, price, cart/order data or anything else.
const memoryTurnSchema = z.object({
  user: z.string().max(MAX_STORED_USER_TEXT),
  assistant: z.string().max(MAX_STORED_ASSISTANT_TEXT),
  products: z.array(z.string().max(MAX_STORED_PRODUCT_NAME)).max(MAX_STORED_PRODUCT_NAMES),
});

export type AiMemoryTurn = z.infer<typeof memoryTurnSchema>;

// undefined = not created yet, null = memory disabled (not configured).
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Unlike GEMINI_API_KEY, memory is optional: the assistant works without
    // it, so a missing variable is logged once instead of failing at import.
    logAiEvent("info", "ai_memory_disabled", { reason: "not_configured" });
    redisClient = null;
    return null;
  }

  redisClient = new Redis({
    url,
    token,
    // One quick retry at most — the default backoff would outlast the
    // timeout below anyway.
    retry: { retries: 1, backoff: () => 50 },
    // Entries are JSON strings parsed and validated here, never trusted as-is.
    automaticDeserialization: false,
    enableTelemetry: false,
  });
  return redisClient;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), AI_MEMORY_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Never logs the key, the session id or any conversation text.
function logMemoryFailure(operation: "read" | "write", err: unknown) {
  logAiEvent("error", "ai_memory_failed", {
    operation,
    reason: err instanceof Error && err.message === "timeout" ? "timeout" : "error",
  });
}

// Resolves which conversation memory this request may use, and must be
// called before the assistant's response starts streaming (a cookie can't be
// set after that). Signed-in customers are identified by the verified JWT
// subject — the same getClaims() check proxy.ts uses — never by anything the
// browser sends in the request body. Guests get the per-browser cookie above,
// issued here if missing. Returns null (no memory this turn) when memory
// isn't configured or identity can't be established.
//
// The "user:"/"guest:" prefixes keep the two namespaces apart, so a guest
// cookie can never name a signed-in customer's key.
export async function resolveAiMemoryKey(): Promise<string | null> {
  if (!getRedis()) return null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (typeof userId === "string" && userId.length > 0) {
      return `${KEY_PREFIX}user:${userId}`;
    }

    const cookieStore = await cookies();
    const existing = cookieStore.get(GUEST_SESSION_COOKIE)?.value;
    if (existing && z.uuid().safeParse(existing).success) {
      return `${KEY_PREFIX}guest:${existing}`;
    }

    const guestId = crypto.randomUUID();
    cookieStore.set(GUEST_SESSION_COOKIE, guestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // No maxAge: a browser-session cookie. The memory itself expires
      // separately, after AI_MEMORY_TTL_SECONDS of inactivity.
    });
    return `${KEY_PREFIX}guest:${guestId}`;
  } catch {
    logAiEvent("error", "ai_memory_failed", { operation: "identify", reason: "error" });
    return null;
  }
}

// Recent turns for `key`, oldest first, at most AI_MEMORY_MAX_TURNS. Any
// failure, timeout, or malformed entry yields fewer (or zero) turns — never
// an error.
export async function readAiMemory(key: string): Promise<AiMemoryTurn[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await withTimeout(redis.lrange<string>(key, -AI_MEMORY_MAX_TURNS, -1));
    const turns: AiMemoryTurn[] = [];
    for (const entry of raw) {
      try {
        const parsed = memoryTurnSchema.safeParse(typeof entry === "string" ? JSON.parse(entry) : entry);
        if (parsed.success) turns.push(parsed.data);
      } catch {
        // Skip an unparsable entry; the rest is still usable.
      }
    }
    return turns;
  } catch (err) {
    logMemoryFailure("read", err);
    return [];
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

// Saves one completed exchange. `startNew` replaces whatever was stored (a
// new or reset conversation), otherwise the turn is appended and the list
// trimmed to the newest AI_MEMORY_MAX_TURNS. Both refresh the TTL, in one
// MULTI/EXEC transaction so a stored list never exists without its expiry.
export async function saveAiMemoryTurn(key: string, turn: AiMemoryTurn, startNew: boolean): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const entry = JSON.stringify({
    user: clip(turn.user, MAX_STORED_USER_TEXT),
    assistant: clip(turn.assistant, MAX_STORED_ASSISTANT_TEXT),
    products: turn.products
      .slice(0, MAX_STORED_PRODUCT_NAMES)
      .map((name) => clip(name, MAX_STORED_PRODUCT_NAME)),
  } satisfies AiMemoryTurn);

  try {
    const tx = redis.multi();
    if (startNew) tx.del(key);
    tx.rpush(key, entry);
    tx.ltrim(key, -AI_MEMORY_MAX_TURNS, -1);
    tx.expire(key, AI_MEMORY_TTL_SECONDS);
    await withTimeout(tx.exec());
  } catch (err) {
    logMemoryFailure("write", err);
  }
}
