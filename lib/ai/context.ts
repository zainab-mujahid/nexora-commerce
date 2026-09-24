import * as z from "zod";

// No "server-only" guard here, unlike lib/ai/intent.ts, lib/ai/retrieval.ts,
// and lib/ai/recommend.ts — those files perform real Gemini/Supabase I/O
// with secrets and must never reach the browser. This file is pure
// validation logic with no I/O and no secrets, same as lib/cart/schemas.ts
// — safe to import from anywhere, server or client.

// Mirrors lib/ai/intent.ts's own MAX_SEMANTIC_QUERY_LENGTH — kept in sync
// deliberately, not derived from it (that constant is private to
// intent.ts), same pattern lib/ai/retrieval.ts's MAX_MATCH_COUNT already
// uses for match_products()'s own clamp. A ShoppingContext.semanticQuery is
// always sourced from a validated ShoppingIntentUpdate.semanticQuery (via
// lib/ai/search.ts's buildShoppingContextTurnInput() and
// mergeShoppingContext() below), so it must never be allowed to exceed the
// bound that value was already validated against there.
const MAX_SEMANTIC_QUERY_LENGTH = 500;

// Mirrors lib/ai/recommend.ts's own MAX_RECOMMENDATIONS — a
// recommendedProductIds list can never legitimately contain more entries
// than a single turn's own generateGroundedRecommendation() call can ever
// return, so this is the natural bound, not an arbitrary "small number."
const MAX_RECOMMENDED_PRODUCT_IDS = 5;

// Bound for shownProductIds: five turns' worth of MAX_RECOMMENDED_PRODUCT_IDS.
// Enough for repeated "show me another one" follow-ups to keep skipping
// what was already shown, while keeping the browser-round-tripped context
// small.
export const MAX_SHOWN_PRODUCT_IDS = 25;

// Bounded, structured multi-turn shopping context (Step 22 Phase 7B). This
// is NOT a transcript and NOT free-form model output — every field is one
// deterministic, previously-verified shopping fact (a semantic need, a
// resolved category, a price range, a stated price direction, a set of
// already-recommended product ids). Never raw prose, never a raw product
// object, never a raw category-text guess.
//
// TRUST RULE: this object is designed to round-trip through the browser —
// lib/ai/actions.ts's askShoppingAssistant() (Step 22 Phase 7F) returns it,
// the browser stores it and echoes it back on the next turn. That round
// trip makes it untrusted on arrival, exactly like any other Server Action
// input (see askShoppingAssistant(input: unknown, previousContext:
// unknown)). The fact that the server originally produced a given
// ShoppingContext value does NOT exempt it from full revalidation the next
// time it arrives from the client — this schema is that revalidation.
// Format validity alone is also not the same as current truth: whichever
// caller consumes categoryId or recommendedProductIds (lib/ai/search.ts)
// is still responsible for re-checking them against live data (a real,
// currently-existing category; real, currently-purchasable products) —
// this schema only guarantees shape, never freshness.
//
// Deliberately excluded: full transcript text, assistant-generated prose,
// raw product objects, raw category text, and requestedCount (a one-off
// per-turn modifier — see lib/ai/intent.ts's ShoppingIntent — not durable
// shopping state carried across turns).
//
// contextAction (how a new turn's raw message relates to this context —
// refine vs. new vs. clear) deliberately does NOT live here: per the
// approved Phase 7A design, that is a bounded enum Gemini produces fresh
// each turn describing the relationship between this context and the
// *current* message, which the application then uses to drive a
// deterministic merge. It is not a durable fact about the shopping session
// itself, so it has no place in the context object being carried forward.
export const shoppingContextSchema = z
  .object({
    semanticQuery: z
      .string()
      .trim()
      .min(1, { error: "semanticQuery must not be empty when present." })
      .max(MAX_SEMANTIC_QUERY_LENGTH, {
        error: `semanticQuery must be ${MAX_SEMANTIC_QUERY_LENGTH} characters or fewer.`,
      })
      .nullable(),
    categoryId: z.uuid({ error: "categoryId must be a valid UUID." }).nullable(),
    minPrice: z
      .number()
      .finite({ error: "minPrice must be a finite number." })
      .min(0, { error: "minPrice must not be negative." })
      .nullable(),
    maxPrice: z
      .number()
      .finite({ error: "maxPrice must be a finite number." })
      .min(0, { error: "maxPrice must not be negative." })
      .nullable(),
    // Deliberately a coarse stated direction, not a number: per the
    // approved Phase 7A corrections, the application must never invent an
    // arbitrary numeric price boundary the customer never stated. What
    // this does to retrieval is implemented in lib/ai/search.ts's
    // resolvePriceReference()/matchesPriceReference() (Step 22 Phase
    // 7E) as a strict, server-derived comparison — this field itself
    // still only ever records intent, never a computed threshold.
    pricePreference: z.enum(["cheaper", "more_expensive"], {
      error: "pricePreference must be \"cheaper\", \"more_expensive\", or null.",
    }).nullable(),
    recommendedProductIds: z
      .array(z.uuid({ error: "recommendedProductIds entries must be valid UUIDs." }))
      .max(MAX_RECOMMENDED_PRODUCT_IDS, {
        error: `recommendedProductIds must have at most ${MAX_RECOMMENDED_PRODUCT_IDS} entries.`,
      })
      // Duplicates are not a security concern (every entry already passed
      // UUID-format validation above) — just redundant data — so they are
      // silently deduped, keeping first-occurrence order, rather than
      // rejecting the whole context. Mirrors lib/ai/recommend.ts's own
      // duplicate-productId handling in generateGroundedRecommendation().
      .transform((ids) => Array.from(new Set(ids))),
    // Every verified recommendation shown during this conversation's
    // follow-ups (oldest first), used ONLY to exclude already-shown
    // products when a turn asks for something different
    // (ShoppingIntentUpdate.excludePreviouslyShown) — never as a price
    // reference (that stays recommendedProductIds: the latest turn's
    // picks), never to add or describe a product. Like recommendedProductIds
    // it round-trips through the browser, so it is untrusted: UUID-only and
    // bounded here, and the worst a tampered list can do is hide products
    // from that same visitor's own results. Defaults to [] so a context
    // saved before this field existed still validates.
    shownProductIds: z
      .array(z.uuid({ error: "shownProductIds entries must be valid UUIDs." }))
      .max(MAX_SHOWN_PRODUCT_IDS, {
        error: `shownProductIds must have at most ${MAX_SHOWN_PRODUCT_IDS} entries.`,
      })
      .transform((ids) => Array.from(new Set(ids)))
      .default([]),
  })
  .refine(
    (data) => data.minPrice === null || data.maxPrice === null || data.minPrice <= data.maxPrice,
    { error: "minPrice must not exceed maxPrice.", path: ["minPrice"] },
  );

export type ShoppingContext = z.infer<typeof shoppingContextSchema>;

// ---- Step 22 Phase 7C — deterministic ShoppingContext merge ----

// A single field's per-turn update. Three states, not two, because a
// plain nullable value cannot distinguish "the user didn't mention this"
// from "the user explicitly wants this constraint gone" — e.g. "show me
// cheaper ones" (semanticQuery/categoryId/maxPrice all "unchanged") vs.
// "forget the $100 limit" (maxPrice explicitly "clear", everything else
// "unchanged") vs. "actually show me electronics" (categoryId "set",
// semanticQuery "set", maxPrice "clear" or "unchanged" depending on
// whether the old price limit was meant to carry over — see
// mergeShoppingContext()'s contextAction handling below for how that
// ambiguity is resolved deterministically rather than left to guesswork).
export type ShoppingContextFieldUpdate<T> =
  | { kind: "unchanged" }
  | { kind: "set"; value: T }
  | { kind: "clear" };

function fieldUpdateSchema<Value extends z.ZodType>(valueSchema: Value) {
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unchanged") }),
    z.object({ kind: z.literal("set"), value: valueSchema }),
    z.object({ kind: z.literal("clear") }),
  ]);
}

// The smallest per-turn merge input: bounded contextAction (a
// classification of how THIS turn's raw message relates to the previous
// context — later produced by Gemini, never by this module) plus one
// ShoppingContextFieldUpdate per durable ShoppingContext field that can
// meaningfully be "set" or "clear"ed by a single turn.
//
// recommendedProductIds is deliberately NOT part of this type: it is never
// something a turn's raw message "sets" or "clears" the way a price or
// category can be — it is populated by lib/ai/assistant.ts, after the
// recommendation pipeline runs, from this turn's own verified results, and
// mergeShoppingContext() below only ever decides whether to temporarily
// retain or drop the *previous* turn's ids, using contextAction alone.
//
// categoryId here takes an already-resolved category UUID, never raw
// category text — mirrors lib/ai/search.ts's resolveCategoryId() being the
// only path from text to a trusted id; this schema doesn't re-derive that,
// it just accepts a UUID exactly like shoppingContextSchema.categoryId
// does, deferring "is this actually a live category" to whichever later
// phase resolves it before constructing this input in the first place.
//
// A "set" minPrice+maxPrice combination that would itself be inconsistent
// (min > max) is rejected here, since the schema can see both this turn's
// own values together. It cannot know about values that would only become
// inconsistent after inheriting from `previous` (e.g. this turn "set"s a
// minPrice above an *inherited* maxPrice) — that combination is instead
// caught by mergeShoppingContext() re-validating its final output against
// shoppingContextSchema (see below), which is the authoritative check.
export const shoppingContextTurnInputSchema = z
  .object({
    contextAction: z.enum(["refine", "new", "clear"], {
      error: 'contextAction must be "refine", "new", or "clear".',
    }),
    semanticQuery: fieldUpdateSchema(
      z
        .string()
        .trim()
        .min(1, { error: "semanticQuery must not be empty when set." })
        .max(MAX_SEMANTIC_QUERY_LENGTH, {
          error: `semanticQuery must be ${MAX_SEMANTIC_QUERY_LENGTH} characters or fewer.`,
        }),
    ),
    categoryId: fieldUpdateSchema(z.uuid({ error: "categoryId must be a valid UUID." })),
    minPrice: fieldUpdateSchema(
      z
        .number()
        .finite({ error: "minPrice must be a finite number." })
        .min(0, { error: "minPrice must not be negative." }),
    ),
    maxPrice: fieldUpdateSchema(
      z
        .number()
        .finite({ error: "maxPrice must be a finite number." })
        .min(0, { error: "maxPrice must not be negative." }),
    ),
    pricePreference: fieldUpdateSchema(
      z.enum(["cheaper", "more_expensive"], {
        error: 'pricePreference must be "cheaper" or "more_expensive" when set.',
      }),
    ),
  })
  .refine(
    (data) =>
      data.minPrice.kind !== "set" ||
      data.maxPrice.kind !== "set" ||
      data.minPrice.value <= data.maxPrice.value,
    { error: "minPrice must not exceed maxPrice.", path: ["minPrice"] },
  );

export type ShoppingContextTurnInput = z.infer<typeof shoppingContextTurnInputSchema>;

// Resolves one field of the OUTGOING context from this turn's update plus
// (for "refine" only) the previous context's value for that same field.
// This single function is the entire unchanged/set/clear interpretation —
// used identically for every field except recommendedProductIds:
//   - "set"       -> always this turn's value, regardless of contextAction.
//     An explicit statement this turn is always authoritative over
//     whatever came before.
//   - "clear"     -> always null, regardless of contextAction. An explicit
//     removal ("forget the $100 limit") is honored unconditionally — it
//     doesn't matter whether the rest of the request also changed topic.
//   - "unchanged" -> inherits `previousValue` ONLY when contextAction is
//     "refine"; otherwise null. Since previousValue is also null whenever
//     there is no previous context at all, this one branch already
//     satisfies rule A (no previous context => current turn becomes the
//     new context) and rules B/C (new/clear => nothing old persists)
//     without any separate special-casing.
function resolveField<T>(
  contextAction: ShoppingContextTurnInput["contextAction"],
  previousValue: T | null,
  update: ShoppingContextFieldUpdate<T>,
): T | null {
  switch (update.kind) {
    case "set":
      return update.value;
    case "clear":
      return null;
    case "unchanged":
      return contextAction === "refine" ? previousValue : null;
  }
}

// The pure, deterministic Phase 7C merge layer. No I/O, no Gemini call, no
// database access — combines a previously-validated ShoppingContext (or
// null on the very first turn) with this turn's already-validated
// ShoppingContextTurnInput into the next ShoppingContext.
//
// Design decisions worth calling out explicitly:
//
// 1. pricePreference is current-turn-only: it is kept only when THIS turn
//    "set"s it, and is null otherwise ("unchanged" does not inherit it).
//    "Cheaper"/"more expensive" is a comparison against the previous
//    turn's recommendations, not a lasting constraint — inheriting it made
//    an unrelated follow-up ("only black ones") re-apply "cheaper" against
//    the newer, lower picks. A follow-up that compares again ("even
//    cheaper") sets it again. Absolute constraints (minPrice/maxPrice/
//    categoryId/semanticQuery) are unaffected and still carry forward.
//
// 2. recommendedProductIds is retained from `previous` only when
//    contextAction is "refine" — this is exactly the candidate reference
//    set lib/ai/search.ts's resolvePriceReference() re-fetches
//    authoritatively and uses for the strict "cheaper"/"more_expensive"
//    comparison (Step 22 Phase 7E); it is dropped to [] for "new"/"clear"
//    or when there is no previous context, so a genuinely new request is
//    never anchored to old results. The *next* real recommendation ids
//    always overwrite this field once the recommendation pipeline
//    actually runs, in lib/ai/assistant.ts — this function never invents
//    or fetches product data itself. shownProductIds follows the same
//    retain-on-refine / reset-on-new-or-clear rule; lib/ai/assistant.ts
//    appends each turn's verified picks to it (appendShownProductIds()).
//
// 3. The computed result is re-validated through shoppingContextSchema
//    before being returned — this is the authoritative consistency check
//    (e.g. catches an inherited maxPrice made inconsistent by a freshly
//    "set" minPrice, which shoppingContextTurnInputSchema's own refine
//    cannot see). A merge that produces an internally inconsistent
//    ShoppingContext throws, the same "never fabricate/coerce" behavior
//    this codebase already uses elsewhere (e.g. semanticProductSearch()'s
//    own min>max rejection) — callers are expected to fail safe (e.g. fall
//    back to a cleared context) rather than have this function silently
//    paper over a contradiction.
export function mergeShoppingContext(
  previous: ShoppingContext | null,
  turn: ShoppingContextTurnInput,
): ShoppingContext {
  const semanticQuery = resolveField(
    turn.contextAction,
    previous?.semanticQuery ?? null,
    turn.semanticQuery,
  );
  const categoryId = resolveField(turn.contextAction, previous?.categoryId ?? null, turn.categoryId);
  const minPrice = resolveField(turn.contextAction, previous?.minPrice ?? null, turn.minPrice);
  const maxPrice = resolveField(turn.contextAction, previous?.maxPrice ?? null, turn.maxPrice);
  const pricePreference = turn.pricePreference.kind === "set" ? turn.pricePreference.value : null;

  const recommendedProductIds =
    turn.contextAction === "refine" && previous ? previous.recommendedProductIds : [];
  const shownProductIds = turn.contextAction === "refine" && previous ? previous.shownProductIds : [];

  return shoppingContextSchema.parse({
    semanticQuery,
    categoryId,
    minPrice,
    maxPrice,
    pricePreference,
    recommendedProductIds,
    shownProductIds,
  });
}

// Adds a turn's verified recommendation ids to the conversation's shown
// list: oldest first, an id shown again moves to the newest position, and
// only the most recent MAX_SHOWN_PRODUCT_IDS are kept.
export function appendShownProductIds(previous: string[], latest: string[]): string[] {
  const latestSet = new Set(latest);
  const combined = [...previous.filter((id) => !latestSet.has(id)), ...latestSet];
  return combined.slice(-MAX_SHOWN_PRODUCT_IDS);
}
