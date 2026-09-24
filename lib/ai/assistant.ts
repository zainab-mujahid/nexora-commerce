import "server-only";

import { appendShownProductIds, shoppingContextSchema, type ShoppingContext } from "./context";
import { generateGroundedRecommendation, type GroundedRecommendation } from "./recommend";
import { searchProductsWithShoppingContext } from "./search";

export type ShoppingAssistantResponse =
  // Deterministic outcome: retrieval found no purchasable candidates at
  // all. No generation call is spent on this case — there is nothing for
  // Gemini to ground a recommendation in, and asking it to invent
  // alternatives would violate the whole point of Phase 5. Still carries
  // the updated context (Step 22 Phase 7E): the customer's stated
  // constraints for this turn are real and worth keeping for the next
  // follow-up even when they matched nothing right now — but
  // recommendedProductIds is always [] here, never stale ids left over
  // from a previous turn's actual results.
  | { status: "no_results"; context: ShoppingContext }
  | {
      status: "ok";
      message: string;
      recommendations: GroundedRecommendation[];
      context: ShoppingContext;
    };

// Final Step 22 orchestration, reusing (not duplicating) every earlier
// phase:
//
//   userInput + previousContext
//     -> searchProductsWithShoppingContext() [Phase 7E: context-aware
//        intent extraction + category bridge + deterministic merge +
//        Phase 3 semantic retrieval, itself built entirely on unchanged
//        Phase 3/4 primitives]
//     -> authoritative candidate products + the merged ShoppingContext
//     -> generateGroundedRecommendation() [Phase 5: bounded grounding
//        context -> structured Gemini generation -> Zod validation ->
//        candidate-id allowlist verification — completely UNCHANGED by
//        Phase 7E; it still only ever receives authoritative retrieval
//        products and the raw current-turn userInput, never previous
//        context, never client-supplied product data]
//     -> authoritative products + generated explanation + updated context
//
// previousContext defaults to null and is re-validated defensively here
// (fail-open to null on anything malformed) before use — the same
// boundary discipline every other Phase 7 entry point applies to a value
// that round-trips through the browser (lib/ai/actions.ts, Step 22 Phase
// 7F, passes the customer's real previous context here on every follow-up
// turn). A first turn (no previous context yet) gets previousContext =
// null, which searchProductsWithShoppingContext()/
// extractShoppingContextUpdate() handle as an ordinary first turn — see
// lib/ai/intent.ts's Phase 7D design for why that degrades correctly
// rather than regressing single-turn behavior.
//
// Throws on any failure along the way (invalid input, a Gemini/retrieval
// failure) — same controlled-failure contract as the functions it calls.
// Never fabricates a recommendation and never falls back to an ungrounded
// answer if grounded generation fails.
export async function getShoppingAssistantResponse(
  userInput: string,
  previousContext: ShoppingContext | null = null,
): Promise<ShoppingAssistantResponse> {
  const safePreviousContext = previousContext
    ? (shoppingContextSchema.safeParse(previousContext).data ?? null)
    : null;

  const { context, products, priceReference, alternativesExcluded } = await searchProductsWithShoppingContext(
    userInput,
    safePreviousContext,
  );

  if (products.length === 0) {
    // No stale recommendation ids survive into the returned context for a
    // turn that produced no results (Step 22 Phase 7E requirement) — the
    // rest of the merged context (semanticQuery/categoryId/prices) is
    // still returned, since it reflects real, just-stated customer intent
    // that remains useful for the next follow-up.
    return {
      status: "no_results",
      context: shoppingContextSchema.parse({ ...context, recommendedProductIds: [] }),
    };
  }

  const { message, recommendations } = await generateGroundedRecommendation({
    userRequest: userInput,
    products,
    priceReference,
    alternativesExcluded,
  });

  // The updated context's recommendedProductIds contains ONLY ids that
  // just came out of generateGroundedRecommendation()'s own candidate-id
  // allowlist verification above — never arbitrary retrieval candidates,
  // never Gemini-invented ids, never anything client-supplied. Already
  // bounded (generateGroundedRecommendation()'s own MAX_RECOMMENDATIONS
  // matches lib/ai/context.ts's MAX_RECOMMENDED_PRODUCT_IDS), and
  // re-validated through shoppingContextSchema regardless as this
  // module's own defense-in-depth gate before returning.
  // shownProductIds accumulates the same verified ids across this
  // conversation's follow-ups (mergeShoppingContext() already reset it for
  // a new/cleared search), so a later "show me another one" can skip them.
  // On the no_results branch above it is left as merged, i.e. preserved.
  const verifiedIds = recommendations.map((rec) => rec.product.id);
  const updatedContext = shoppingContextSchema.parse({
    ...context,
    recommendedProductIds: verifiedIds,
    shownProductIds: appendShownProductIds(context.shownProductIds, verifiedIds),
  });

  return { status: "ok", message, recommendations, context: updatedContext };
}
