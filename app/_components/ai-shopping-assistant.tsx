"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { askShoppingAssistant, type AssistantTurnResult } from "@/lib/ai/actions";
import type { SemanticProductSearchResult } from "@/lib/ai/retrieval";

import { ProductGrid } from "./product-grid";

// Mirrors lib/ai/actions.ts's own bound — UX only. The Server Action
// re-validates this itself and is the actual enforcement point.
const MAX_INPUT_LENGTH = 500;

type Recommendation = { product: SemanticProductSearchResult; reason: string };

type AssistantMessage =
  | { role: "user"; id: string; text: string }
  | {
      role: "assistant";
      id: string;
      kind: "ok";
      text: string;
      recommendations: Recommendation[];
    }
  | { role: "assistant"; id: string; kind: "no_results" }
  | { role: "assistant"; id: string; kind: "error"; error: string };

function toAssistantMessage(id: string, result: AssistantTurnResult): AssistantMessage {
  switch (result.status) {
    case "ok":
      return {
        role: "assistant",
        id,
        kind: "ok",
        text: result.message,
        recommendations: result.recommendations,
      };
    case "no_results":
      return { role: "assistant", id, kind: "no_results" };
    case "error":
      return { role: "assistant", id, kind: "error", error: result.error };
  }
}

// Shared storefront component, mounted independently on both / (Home) and
// /products — each mount is its own component instance with its own
// useState, so Home's and /products' assistant state can never see each
// other, and navigating between the two naturally starts fresh (no shared
// layout holds this state across routes).
//
// Single owner of all AI-shopping-assistant state for whichever page mounts
// it: transcript, the storefront "AI Recommendations" section (including
// whether it's currently showing or the user dismissed it via "View All
// Products"), and the panel's open/closed state. All of this is plain
// useState in this one client component instance — nothing here is written
// to Supabase, a global variable, or any shared cache, so this state is
// inherently scoped to one browser's React tree and can never leak between
// visitors. A page refresh clears it, which is intentional for this phase
// (see implementation-plan.txt Step 22 Phase 6).
//
// `children` is the page's own normal, server-rendered product content
// (the /products grid+pagination, or Home's FeaturedProducts) — it is
// constructed and rendered entirely server-side by the calling page before
// ever reaching this component; this component only decides whether to
// include that already-rendered subtree in its output or swap in the AI
// Recommendations section instead. No fetching moves to the client, and no
// SSR behavior of `children` itself changes.
export function AiShoppingAssistant({
  recommendationsSectionClassName = "",
  children,
}: {
  // Outer className for the "AI Recommendations" <section>. /products relies
  // on its own <main>'s shared max-w-6xl/gap/padding (pass nothing); Home has
  // no such shared container per-section, so it passes its own
  // mx-auto/max-w-6xl/px-6 to match how app/_components/featured-products.tsx
  // styles itself.
  recommendationsSectionClassName?: string;
  children: ReactNode;
}) {
  const [transcript, setTranscript] = useState<AssistantMessage[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  // true once the user has clicked "View All Products" for the *current*
  // set of recommendations — reset to false whenever a new "ok" result
  // replaces them, so a fresh recommendation always shows automatically
  // even after a prior dismissal.
  const [viewAllProducts, setViewAllProducts] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLLIElement>(null);

  const showRecommendations = recommendations.length > 0 && !viewAllProducts;

  // Auto-scrolls the message area to the newest turn, including the
  // transient "Thinking…" bubble — scrollIntoView targets the nearest
  // scrollable ancestor, which is the overflow-y-auto message list below,
  // not the page itself.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [transcript, isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = inputValue.trim();
    if (text.length === 0 || isPending) return;

    setInputValue("");
    setTranscript((prev) => [...prev, { role: "user", id: crypto.randomUUID(), text }]);

    startTransition(async () => {
      // Exactly one call per turn, sending only this turn's text — no prior
      // transcript is ever sent back to the pipeline or to Gemini.
      const result = await askShoppingAssistant(text);

      // Storefront "AI Recommendations" section update rule:
      // - "ok": replace with this turn's verified recommendations and show
      //   them (even if the user had previously clicked "View All
      //   Products" for an older set — a *new* result always takes over).
      //   An empty recommendations array here still shows nothing, since
      //   showRecommendations requires a non-empty list.
      // - "no_results": clear the recommendations and fall back to normal
      //   product content — never leave the user on an empty
      //   recommendation-only view.
      // - "error": touch neither `recommendations` nor `viewAllProducts` —
      //   the current storefront view (recommendations showing, or normal
      //   content after a prior "View All Products") is left exactly as it
      //   was. The failure is only ever shown as this turn's chat bubble.
      if (result.status === "ok") {
        setRecommendations(result.recommendations);
        setViewAllProducts(false);
      } else if (result.status === "no_results") {
        setRecommendations([]);
        setViewAllProducts(false);
      }

      setTranscript((prev) => [...prev, toAssistantMessage(crypto.randomUUID(), result)]);
    });
  }

  return (
    <>
      {showRecommendations ? (
        <section className={`flex flex-col gap-4 ${recommendationsSectionClassName}`}>
          <h2 className="text-lg font-semibold tracking-tight">AI Recommendations</h2>
          {/* Reuses ProductGrid/ProductCard unchanged — every rendered field
              and link comes from the authoritative product object, never
              from assistant prose. */}
          <ProductGrid products={recommendations.map((rec) => rec.product)} />
          {/* Visually secondary on purpose — plain text-style control, no
              border/background, so it never competes with the heading or
              the recommended products above it. self-start keeps it from
              stretching full-width under this flex-col section. */}
          <button
            type="button"
            onClick={() => setViewAllProducts(true)}
            className="self-start text-sm font-medium text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
          >
            View All Products
          </button>
        </section>
      ) : (
        // Already-rendered server content, handed to this client component
        // as `children` — swapping it back in here does not re-fetch or
        // re-render it, and never touches Supabase/URL/search state.
        children
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="ai-shopping-assistant-panel"
        className="fixed bottom-6 right-6 z-50 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background shadow-lg hover:opacity-90"
      >
        {isOpen ? "Close Assistant" : "AI Shopping Assistant"}
      </button>

      {/* Conditionally rendered, but transcript/recommendations state lives
          in this parent component, not inside this subtree — closing the
          panel unmounts only this JSX, never the state, so reopening shows
          the same session's transcript and recommendations unchanged. */}
      {isOpen && (
        <div
          id="ai-shopping-assistant-panel"
          role="dialog"
          aria-label="AI Shopping Assistant"
          // Mobile (base): unchanged full-width bottom sheet, up to 80vh.
          // Desktop (sm+): a compact floating card anchored above the
          // trigger button (bottom-24 right-6, matching the button's own
          // bottom-6 right-6 with room to spare) instead of a full-height
          // right-side drawer — sm:inset-x-auto/sm:top-auto undo the
          // mobile inset-x-0/bottom-0 positioning so the explicit
          // bottom/right/width/height values below take over.
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden border-t border-black/10 bg-background sm:inset-x-auto sm:top-auto sm:bottom-24 sm:right-6 sm:h-[58vh] sm:max-h-[600px] sm:w-[380px] sm:max-w-[calc(100vw-3rem)] sm:rounded-xl sm:border sm:shadow-lg dark:border-white/10 dark:bg-background"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold">AI Shopping Assistant</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant panel"
              className="text-sm text-foreground/60 hover:opacity-70"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="flex flex-col gap-3">
              {transcript.length === 0 && (
                <li className="text-sm text-foreground/60">
                  Ask for what you need — e.g. &quot;comfortable black office shoes under $100&quot;.
                </li>
              )}

              {transcript.map((message) => (
                <li
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  {message.role === "user" ? (
                    <p className="max-w-[85%] rounded-md bg-foreground px-3 py-2 text-sm text-background">
                      {message.text}
                    </p>
                  ) : (
                    <div className="max-w-[85%] rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                      {message.kind === "ok" && (
                        <>
                          <p>{message.text}</p>
                          {/* Conversational text only — no ProductCard here.
                              The product name shown is the authoritative
                              product.name, not assistant-invented text. */}
                          {message.recommendations.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/60">
                              {message.recommendations.map((rec) => (
                                <li key={rec.product.id}>
                                  <span className="font-medium text-foreground">
                                    {rec.product.name}:
                                  </span>{" "}
                                  {rec.reason}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      {message.kind === "no_results" && (
                        <p>
                          I couldn&apos;t find any matching products in the catalog. Try
                          rephrasing your request.
                        </p>
                      )}
                      {message.kind === "error" && <p className="text-red-600">{message.error}</p>}
                    </div>
                  )}
                </li>
              ))}

              {isPending && (
                <li className="flex justify-start">
                  <div className="max-w-[85%] rounded-md border border-black/10 px-3 py-2 text-sm text-foreground/60 dark:border-white/10">
                    Thinking…
                  </div>
                </li>
              )}

              <li ref={messagesEndRef} aria-hidden="true" />
            </ul>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 items-center gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              maxLength={MAX_INPUT_LENGTH}
              disabled={isPending}
              placeholder="e.g. comfortable black office shoes under $100"
              aria-label="Shopping request"
              className="flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50 disabled:opacity-60 dark:border-white/20"
            />
            <button
              type="submit"
              disabled={isPending || inputValue.trim().length === 0}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
