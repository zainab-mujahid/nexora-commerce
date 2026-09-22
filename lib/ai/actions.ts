"use server";

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

export type AssistantTurnResult =
  | {
      status: "ok";
      message: string;
      recommendations: { product: SemanticProductSearchResult; reason: string }[];
    }
  | { status: "no_results" }
  | { status: "error"; error: string };

// The one server boundary the client-side chat UI calls (see
// app/_components/ai-shopping-assistant.tsx, mounted on both / and
// /products) — invoked directly from a client event
// handler wrapped in startTransition, not through useActionState/<form
// action>, since the client owns the growing transcript itself and this
// only ever needs to return a single turn's result. Also the intended
// Phase 8 rate-limiting boundary: every shopping-assistant request from any
// client funnels through this one function, so a future limiter has a
// single place to attach to.
//
// This is a public POST-reachable Server Action (Next.js: "reachable to
// anyone who can send the same POST", not only through this page's UI), so
// input is validated here rather than trusted from the client's own
// maxLength or from getShoppingAssistantResponse()'s downstream checks.
export async function askShoppingAssistant(input: unknown): Promise<AssistantTurnResult> {
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

  try {
    const result = await getShoppingAssistantResponse(trimmed);
    if (result.status === "no_results") {
      return { status: "no_results" };
    }
    return { status: "ok", message: result.message, recommendations: result.recommendations };
  } catch (err) {
    // Never return err.message to the client: every current lib/ai/* throw
    // site already returns a short, generic, safe-to-surface string (see
    // e.g. lib/ai/intent.ts, lib/ai/recommend.ts), but this boundary does
    // not rely on that holding true forever — an unanticipated failure
    // could in principle carry provider/internal detail. The real detail
    // is logged server-side only; the client always gets the same fixed
    // safe message.
    console.error(
      "askShoppingAssistant: getShoppingAssistantResponse failed:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { status: "error", error: GENERIC_ERROR_MESSAGE };
  }
}
