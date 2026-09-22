import "server-only";

import { generateGroundedRecommendation, type GroundedRecommendation } from "./recommend";
import { searchProductsFromNaturalLanguage } from "./search";

export type ShoppingAssistantResponse =
  // Deterministic outcome: retrieval found no purchasable candidates at
  // all. No generation call is spent on this case — there is nothing for
  // Gemini to ground a recommendation in, and asking it to invent
  // alternatives would violate the whole point of Phase 5.
  | { status: "no_results" }
  | {
      status: "ok";
      message: string;
      recommendations: GroundedRecommendation[];
    };

// Final Step 22 Phase 5 orchestration, reusing (not duplicating) every
// earlier phase:
//
//   userInput
//     -> searchProductsFromNaturalLanguage() [Phase 4: intent extraction +
//        deterministic category resolution + Phase 3 semantic retrieval]
//     -> authoritative candidate products
//     -> generateGroundedRecommendation() [Phase 5: bounded grounding
//        context -> structured Gemini generation -> Zod validation ->
//        candidate-id allowlist verification]
//     -> authoritative products + generated explanation
//
// Throws on any failure along the way (invalid input, a Gemini/retrieval
// failure) — same controlled-failure contract as the functions it calls.
// Never fabricates a recommendation and never falls back to an ungrounded
// answer if grounded generation fails.
export async function getShoppingAssistantResponse(
  userInput: string,
): Promise<ShoppingAssistantResponse> {
  const { products } = await searchProductsFromNaturalLanguage(userInput);

  if (products.length === 0) {
    return { status: "no_results" };
  }

  const { message, recommendations } = await generateGroundedRecommendation({
    userRequest: userInput,
    products,
  });

  return { status: "ok", message, recommendations };
}
