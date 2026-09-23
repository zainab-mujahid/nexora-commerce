"use server";

import { shoppingContextSchema, type ShoppingContext } from "./context";
import { getShoppingAssistantResponse } from "./assistant";
import { classifyAiError, type AiErrorCategory } from "./errors";
import { logAiEvent } from "./log";
import { consumeAiRateLimit } from "./rate-limit";
import type { SemanticProductSearchResult } from "./retrieval";

// A "use server" module's exports must all be async functions — no plain
// value export (e.g. a MAX_INPUT_LENGTH constant) is allowed here. The
// 500-char bound below mirrors lib/ai/intent.ts's own MAX_INPUT_LENGTH and
// app/_components/ai-shopping-assistant.tsx's client-side maxLength — kept in sync
// deliberately, not derived from either, same pattern as
// lib/ai/retrieval.ts's MAX_MATCH_COUNT mirroring match_products()'s own
// clamp. This is the actual enforcement point: the client's maxLength is
// only a UX nicety, and getShoppingAssistantResponse()'s own downstream
// validation is not a substitute for validating input at this boundary.
const MAX_INPUT_LENGTH = 500;

const GENERIC_ERROR_MESSAGE =
  "The shopping assistant is temporarily unavailable. Please try again.";

// Step 22 Phase 8D: application-level rate limiting, NOT Gemini/provider
// rate limiting (see lib/ai/rate-limit.ts for the full identity/storage
// design). This is the fixed, safe, generic text shown when our OWN
// server-side check rejects a request before any AI/provider work —
// deliberately vague about the exact limit/window, matching the same
// "never expose infrastructure details" discipline every other
// browser-facing string in this file already follows.
const RATE_LIMITED_MESSAGE =
  "You're sending requests a bit too quickly. Please wait a moment and try again.";

// Step 22 Phase 8C: one safe, generic, non-provider-specific message per
// broad failure category (Phase 8A's AiErrorCategory) — never the raw
// err.message, never a provider name, never an HTTP status, never a stack
// trace, never a prompt, never a response body. This is the ONLY place in
// the app that decides browser-facing AI-failure copy, matching the
// existing convention that every other user-facing string in this file
// (NO_RESULTS_MESSAGE, the input-validation messages above) is also owned
// locally here rather than in lib/ai/errors.ts, which stays a pure
// classifier with no user-facing-copy concerns of its own.
function getSafeErrorMessage(category: AiErrorCategory): string {
  switch (category) {
    case "rate_limit":
      return "The shopping assistant is receiving too many requests right now. Please try again shortly.";
    case "provider_unavailable":
    case "network":
      // Grouped together deliberately: from the customer's perspective
      // "the provider is down" and "we couldn't reach the provider" are
      // the same actionable advice — try again shortly — and neither
      // reveals whether the failure was on Gemini's side or a network hop
      // in between.
      return "The shopping assistant is temporarily unavailable. Please try again in a moment.";
    case "invalid_response":
      // Gemini's own output failed our validation/allowlist contract —
      // this is the one category where "rephrase" is genuinely actionable
      // advice, unlike a transient provider/network condition.
      return "I couldn't generate a reliable recommendation for that request. Please try rephrasing it.";
    case "internal":
      // Catch-all for anything else, including our own bugs — the exact
      // same generic wording already used everywhere else in this file
      // before Phase 8C, kept as-is for backward-compatible behavior.
      return GENERIC_ERROR_MESSAGE;
  }
}

// Fixed, safe, generic text — never Gemini-authored — matching the exact
// wording app/_components/ai-shopping-assistant.tsx previously hardcoded
// for this case (Step 22 Phase 6). Moving it here (Step 22 Phase 7F) means
// the client renders whatever the Server Action actually returned instead
// of duplicating the same string in two places, without changing what the
// customer sees.
const NO_RESULTS_MESSAGE = "I couldn't find any matching products in the catalog. Try rephrasing your request.";

export type AssistantTurnResult =
  | {
      status: "ok";
      message: string;
      recommendations: { product: SemanticProductSearchResult; reason: string }[];
      context: ShoppingContext;
    }
  | { status: "no_results"; message: string; context: ShoppingContext }
  | { status: "error"; error: string };

// The one server boundary the client-side chat UI calls (see
// app/_components/ai-shopping-assistant.tsx, mounted on both / and
// /products) — invoked directly from a client event handler wrapped in
// startTransition, not through useActionState/<form action>, since the
// client owns the growing transcript itself and this only ever needs to
// return a single turn's result. Also the intended Phase 8 rate-limiting
// boundary: every shopping-assistant request from any client funnels
// through this one function, so a future limiter has a single place to
// attach to.
//
// This is a public POST-reachable Server Action (Next.js: "reachable to
// anyone who can send the same POST", not only through this page's UI), so
// both parameters are validated here rather than trusted from the client.
//
// previousContext (Step 22 Phase 7F): the browser echoes back whatever
// ShoppingContext this function itself returned on a prior turn — but that
// round trip makes it exactly as untrusted as `input`, regardless of who
// originally produced it (see lib/ai/context.ts's own trust-boundary
// notes). It is typed `unknown`, never `ShoppingContext | null`, for the
// same reason `input` is typed `unknown` rather than `string`: the type
// annotation must not be the thing standing between this boundary and a
// malformed value. A malformed/invalid context degrades to null (a fresh,
// context-free turn) rather than failing the whole request or exposing
// any internal detail — getShoppingAssistantResponse() itself performs the
// exact same defensive re-validation as a second, redundant layer, so this
// is belt-and-suspenders, not the only guard.
export async function askShoppingAssistant(
  input: unknown,
  previousContext: unknown,
): Promise<AssistantTurnResult> {
  if (typeof input !== "string") {
    return { status: "error", error: "Please enter a shopping request." };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { status: "error", error: "Please enter a shopping request." };
  }
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      status: "error",
      error: `Please enter a shorter request (${MAX_INPUT_LENGTH} characters max).`,
    };
  }

  // Step 22 Phase 8F: timing starts here, after the free/cheap input-shape
  // checks above (so a malformed request that never reaches AI/rate-limit
  // work doesn't get a misleadingly "fast AI turn" log) but before the
  // rate-limit check and everything downstream — covering the one request
  // outcome (rate_limited/ok/no_results/error) that is actually logged
  // below. performance.now() is monotonic, unaffected by system clock
  // adjustments mid-request.
  const start = performance.now();

  // Step 22 Phase 8D: application-level rate limiting, enforced BEFORE any
  // AI/provider work — checked here, after the free/cheap input-shape
  // checks above (so a malformed request never consumes rate-limit budget)
  // but before anything that costs real quota/compute. Step 24D: the
  // counter lives in Postgres and the bucket key is derived there from the
  // verified session — nothing from `input` or `previousContext` is
  // passed, so the client can't pick, forge or reset a bucket. Called once
  // per request; Gemini retries (lib/ai/client.ts) happen downstream and
  // never consume another unit. See lib/ai/rate-limit.ts for the
  // identity/storage rationale.
  const rateLimit = await consumeAiRateLimit();

  if (rateLimit.status === "unavailable") {
    // Step 24D: fail closed. If the limiter can't be consulted, don't spend
    // Gemini quota unmetered — the assistant is non-essential, and
    // browsing/cart/checkout never go through this path. Only a fixed
    // outcome label is logged, never the database error.
    logAiEvent("error", "ai_shopping_assistant_request", {
      outcome: "rate_limit_unavailable",
      durationMs: Math.round(performance.now() - start),
    });
    return { status: "error", error: GENERIC_ERROR_MESSAGE };
  }

  if (rateLimit.status === "limited") {
    // Step 22 Phase 8F: a safe rate-limit event — no limiter key, no user
    // id, no IP (this function never has an IP to begin with; see
    // lib/ai/rate-limit.ts's own identity-strategy notes).
    logAiEvent("info", "ai_shopping_assistant_request", {
      outcome: "rate_limited",
      durationMs: Math.round(performance.now() - start),
    });
    // No context, no recommendations, no provider work: identical shape
    // to any other status:"error" response, so the client's existing
    // error-branch handling (preserve recommendations/context/view state,
    // Step 22 Phase 7) applies with no new UI logic needed. This is
    // deliberately NOT classifyAiError()/getSafeErrorMessage() (Phase
    // 8A/8C) — those classify a real error that already came back from a
    // Gemini call; this rejection happens before any such call is even
    // attempted, so there is nothing to classify and nothing for Phase 8B's
    // retry layer to ever see.
    return { status: "error", error: RATE_LIMITED_MESSAGE };
  }

  const safePreviousContext: ShoppingContext | null =
    previousContext == null ? null : (shoppingContextSchema.safeParse(previousContext).data ?? null);

  try {
    const result = await getShoppingAssistantResponse(trimmed, safePreviousContext);
    const durationMs = Math.round(performance.now() - start);

    if (result.status === "no_results") {
      // Step 22 Phase 8F: distinguishes "the pipeline ran successfully but
      // found nothing" from a real failure — neither the user's request
      // text nor any product data is logged, only the outcome + timing.
      logAiEvent("info", "ai_shopping_assistant_request", { outcome: "no_results", durationMs });
      return { status: "no_results", message: NO_RESULTS_MESSAGE, context: result.context };
    }

    // Step 22 Phase 8F: recommendationCount is a small integer, not the
    // recommendations themselves — no product id, name, or reason text.
    logAiEvent("info", "ai_shopping_assistant_request", {
      outcome: "success",
      durationMs,
      recommendationCount: result.recommendations.length,
    });
    return {
      status: "ok",
      message: result.message,
      recommendations: result.recommendations,
      context: result.context,
    };
  } catch (err) {
    // Never return err.message, err.cause, a stack trace, a provider name,
    // an HTTP status, or any response body to the client — and never
    // return a context here either: on failure there is nothing new and
    // verified to report, so the response simply carries no context field
    // at all — the client is responsible for leaving its last known-good
    // context, recommendations, and view state untouched when it sees
    // status "error" (see app/_components/ai-shopping-assistant.tsx),
    // rather than this function fabricating or guessing a partial one.
    // Retries already happened, if applicable, inside
    // getShoppingAssistantResponse()'s own call chain (Step 22 Phase 8B,
    // lib/ai/client.ts) — this is not a second retry layer, only the
    // final classification of whatever ultimately escaped it.
    //
    // Step 22 Phase 8C: the category (Phase 8A's classifyAiError()) is
    // used for two things ONLY, both server-side: the structured log event
    // below, and selecting one of a small set of fixed, generic,
    // category-appropriate safe strings via getSafeErrorMessage() above.
    // The category itself is never part of the returned value — the
    // browser receives only the resulting sanitized text, and there is no
    // current UI need for anything more specific than that.
    const category = classifyAiError(err);
    // Step 22 Phase 8F: no console.error(err.message) here anymore — this
    // phase's audit flagged the old version of this line as unsafe (it
    // logged the raw error message, which could echo back provider/request
    // detail). Only the broad category + timing are logged; the downstream
    // operation that actually failed already emitted its own safe
    // "ai_provider_call"/"ai_validation_failed"/"ai_retrieval_failed"/
    // "ai_category_resolution_failed" event closer to the failure.
    logAiEvent("error", "ai_shopping_assistant_request", {
      outcome: "error",
      category,
      durationMs: Math.round(performance.now() - start),
    });
    return { status: "error", error: getSafeErrorMessage(category) };
  }
}
