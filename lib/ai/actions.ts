"use server";

import { shoppingContextSchema, type ShoppingContext } from "./context";
import { getShoppingAssistantResponse } from "./assistant";
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

  const safePreviousContext: ShoppingContext | null =
    previousContext == null ? null : (shoppingContextSchema.safeParse(previousContext).data ?? null);

  try {
    const result = await getShoppingAssistantResponse(trimmed, safePreviousContext);
    if (result.status === "no_results") {
      return { status: "no_results", message: NO_RESULTS_MESSAGE, context: result.context };
    }
    return {
      status: "ok",
      message: result.message,
      recommendations: result.recommendations,
      context: result.context,
    };
  } catch (err) {
    // Never return err.message to the client, and never return a context
    // here either: on failure there is nothing new and verified to report,
    // so the response simply carries no context field at all — the client
    // is responsible for leaving its last known-good context untouched
    // when it sees status "error" (see
    // app/_components/ai-shopping-assistant.tsx), rather than this
    // function fabricating or guessing a partial one.
    console.error(
      "askShoppingAssistant: getShoppingAssistantResponse failed:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { status: "error", error: GENERIC_ERROR_MESSAGE };
  }
}
