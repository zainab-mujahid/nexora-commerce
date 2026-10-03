"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

import {
  askShoppingAssistant,
  type AssistantStreamEvent,
  type AssistantTurnResult,
} from "@/lib/ai/actions";
import type { ShoppingContext } from "@/lib/ai/context";
import type { SemanticProductSearchResult } from "@/lib/ai/retrieval";

import { ProductGrid } from "./product-grid";

// Mirrors lib/ai/actions.ts's own bound — UX only. The Server Action
// re-validates this itself and is the actual enforcement point.
const MAX_INPUT_LENGTH = 500;

// Client-side only: the reply stream broke off (connection lost, server
// restarted) before its final validated result arrived, or the action call
// itself failed. Same tone as lib/ai/actions.ts's own safe messages.
const INTERRUPTED_MESSAGE =
  "The response was interrupted before it finished. Please try again.";

// How close (px) to the bottom of the conversation counts as "following it":
// streamed text keeps the view pinned there, but never drags someone who
// scrolled up to reread an earlier answer.
const STICK_TO_BOTTOM_THRESHOLD = 48;

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
  | { role: "assistant"; id: string; kind: "no_results"; text: string }
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
      return { role: "assistant", id, kind: "no_results", text: result.message };
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
  catalogKey,
  children,
}: {
  // Outer className for the "AI Recommendations" <section>. /products relies
  // on its own <main>'s shared max-w-6xl/gap/padding (pass nothing); Home has
  // no such shared container per-section, so it passes its own
  // mx-auto/max-w-6xl/px-6 to match how app/_components/featured-products.tsx
  // styles itself.
  recommendationsSectionClassName?: string;
  // Identifies the catalog view `children` currently renders (/products
  // passes its filter/sort/page href; Home passes nothing). A change means
  // the customer navigated the catalog — e.g. clicked a category pill — so
  // the new grid must be shown instead of stale recommendations.
  catalogKey?: string;
  children: ReactNode;
}) {
  const [transcript, setTranscript] = useState<AssistantMessage[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  // true once the user has clicked "View All Products" for the *current*
  // set of recommendations — reset to false whenever a new "ok" result
  // replaces them, so a fresh recommendation always shows automatically
  // even after a prior dismissal.
  const [viewAllProducts, setViewAllProducts] = useState(false);
  // Step 22 Phase 7F: the bounded, machine-readable ShoppingContext this
  // askShoppingAssistant() call most recently returned — separate from
  // `transcript` (a display-only log) and never derived from it. Starts
  // null (no prior turn), is sent back verbatim on the next submit, and is
  // replaced wholesale by whatever the server returns — this component
  // never merges/edits it locally. Being one more useState alongside
  // transcript/recommendations above means it inherits the exact same
  // per-browser-instance isolation already documented on this component
  // (see the module comment above): no Context/Zustand/localStorage/
  // sessionStorage/cookies/Supabase/global variable, so a refresh or a
  // navigation to a differently-mounted instance naturally resets it, and
  // two browsers/visitors can never share one.
  const [shoppingContext, setShoppingContext] = useState<ShoppingContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  // The in-progress reply's text as it streams in (display-only — see
  // AssistantStreamEvent in lib/ai/actions.ts). "" until the first chunk.
  const [streamingText, setStreamingText] = useState("");
  // Final reply text for screen readers, announced once per turn — the
  // streaming bubble itself isn't a live region, so partial chunks are
  // never read out one by one.
  const [announcement, setAnnouncement] = useState("");
  // Identifies the one turn allowed to update the UI; chunks from any other
  // (e.g. after unmount) are ignored.
  const activeTurnRef = useRef<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<AssistantStreamEvent> | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Leaving the page mid-reply: stop reading, which lets the server cancel
  // the Gemini request it no longer needs.
  useEffect(
    () => () => {
      activeTurnRef.current = null;
      readerRef.current?.cancel().catch(() => {});
    },
    [],
  );

  // Same-route navigations (/products?category=… soft navigations) re-render
  // this instance with new `children` but keep all of its state, so without
  // this the AI Recommendations section would keep hiding the new grid.
  // Dismissing exactly as "View All Products" does (adjusting state during
  // render when a prop changes) leaves transcript/shoppingContext/isOpen
  // untouched, and the next "ok" result still takes over as usual.
  const [prevCatalogKey, setPrevCatalogKey] = useState(catalogKey);
  if (catalogKey !== prevCatalogKey) {
    setPrevCatalogKey(catalogKey);
    setViewAllProducts(true);
  }

  // catalogKey can't see a click on the already-active pill (same URL), so
  // an explicit click on a link inside a page's `data-catalog-nav` element
  // (/products' category pills; Home has none) is itself treated as intent
  // to view the catalog. Only clicks next/link handled as a client-side
  // navigation count (it calls preventDefault then) — a ctrl/middle-click
  // opening a new tab leaves this view alone.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest("[data-catalog-nav] a")) setViewAllProducts(true);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const showRecommendations = recommendations.length > 0 && !viewAllProducts;

  // Keeps the message area at the newest turn — including the loading-dots
  // bubble and a reply as it streams in — while the customer is following
  // along at the bottom. Scrolls only the overflow-y-auto message list, never
  // the page, and jumps instantly (a smooth scroll restarted on every chunk
  // would lag and judder).
  useEffect(() => {
    const area = scrollAreaRef.current;
    if (area && stickToBottomRef.current) area.scrollTop = area.scrollHeight;
  }, [transcript, isPending, streamingText, isOpen]);

  // Grows the prompt textarea to fit its wrapped text (CSS max-h-32 caps it,
  // after which it scrolls), and shrinks it back once the prompt is cleared
  // on send. Re-runs when the panel opens, since the textarea mounts then.
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const border = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${textarea.scrollHeight + border}px`;
  }, [inputValue, isOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = inputValue.trim();
    if (text.length === 0 || isPending) return;

    setInputValue("");
    setTranscript((prev) => [...prev, { role: "user", id: crypto.randomUUID(), text }]);
    setStreamingText("");
    stickToBottomRef.current = true;

    const turnId = crypto.randomUUID();
    activeTurnRef.current = turnId;

    // The whole turn, stream included, runs inside this transition, so
    // isPending (disabled composer, no duplicate submit) lasts until the
    // final result — not just until the action call returns its stream.
    startTransition(async () => {
      let result: AssistantTurnResult;
      try {
        // Exactly one call per turn, sending only this turn's text plus the
        // last ShoppingContext this component holds — no prior transcript is
        // ever sent back to the pipeline or to Gemini. `shoppingContext` is
        // whatever the server itself returned last time (or null, on the
        // first turn) — never edited or derived locally.
        const response = await askShoppingAssistant(text, shoppingContext);
        result =
          response.status === "streaming"
            ? await readTurnStream(response.events, turnId)
            : response;
      } catch {
        result = { status: "error", error: INTERRUPTED_MESSAGE };
      }

      if (activeTurnRef.current !== turnId) return;
      activeTurnRef.current = null;
      setStreamingText("");
      setAnnouncement(result.status === "error" ? result.error : result.message);

      // Storefront "AI Recommendations" section update rule:
      // - "ok": replace with this turn's verified recommendations and show
      //   them (even if the user had previously clicked "View All
      //   Products" for an older set — a *new* result always takes over).
      //   An empty recommendations array here still shows nothing, since
      //   showRecommendations requires a non-empty list. Also replaces
      //   shoppingContext wholesale with the server's updated context.
      // - "no_results": clear the recommendations and fall back to normal
      //   product content — never leave the user on an empty
      //   recommendation-only view. Still replaces shoppingContext: the
      //   customer's stated constraints for this turn are real and worth
      //   keeping for the next follow-up even though nothing matched.
      // - "error": touch neither `recommendations`, `viewAllProducts`, nor
      //   `shoppingContext` — the current storefront view (recommendations
      //   showing, or normal content after a prior "View All Products")
      //   and the last known-good context are both left exactly as they
      //   were. The failure is only ever shown as this turn's chat bubble;
      //   a transient/provider error must never quietly erase a working
      //   multi-turn conversation.
      if (result.status === "ok") {
        setRecommendations(result.recommendations);
        setViewAllProducts(false);
        setShoppingContext(result.context);
      } else if (result.status === "no_results") {
        setRecommendations([]);
        setViewAllProducts(false);
        setShoppingContext(result.context);
      }

      setTranscript((prev) => [...prev, toAssistantMessage(crypto.randomUUID(), result)]);
    });
  }

  // Reads one turn's events: appends each delta to the in-progress bubble
  // (one render per chunk as the server sends it — no artificial pacing) and
  // returns the final validated result. A stream that ends or breaks before
  // its result is an interrupted turn; whatever partial text arrived is
  // discarded along with it, never kept as an answer.
  async function readTurnStream(
    events: ReadableStream<AssistantStreamEvent>,
    turnId: string,
  ): Promise<AssistantTurnResult> {
    const reader = events.getReader();
    readerRef.current = reader;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || activeTurnRef.current !== turnId) break;
        if (value.type === "result") return value.result;
        setStreamingText((prev) => prev + value.text);
      }
    } finally {
      if (readerRef.current === reader) readerRef.current = null;
    }
    return { status: "error", error: INTERRUPTED_MESSAGE };
  }

  return (
    <>
      {showRecommendations ? (
        <section className={`flex flex-col gap-4 ${recommendationsSectionClassName}`}>
          <div className="flex flex-col gap-2 border-b border-border pb-4">
            <span className="eyebrow">Picked for you</span>
            <h2 className="text-2xl font-semibold tracking-tight">AI Recommendations</h2>
          </div>
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
            className="self-start text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
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
        // theme-inverse: the launcher shares the panel's inverse surface
        // (dark on the light theme, light on the dark theme). Its focus
        // outline is drawn inside the pill: the inverse --ring color would
        // barely show against the page around it.
        className="theme-inverse fixed bottom-4 right-4 z-50 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface pl-4 pr-5 text-sm font-medium text-foreground shadow-[var(--shadow-float)] transition-[background-color,translate,scale] duration-200 ease-[var(--ease-nexora)] hover:-translate-y-0.5 hover:bg-fill focus-visible:-outline-offset-4 active:scale-[0.97] motion-reduce:hover:translate-y-0 sm:bottom-6 sm:right-6"
      >
        {isOpen ? (
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted">
            <path d="m5.5 8 4.5 4.5L14.5 8" />
          </svg>
        ) : (
          <SparkleIcon className="size-4 text-muted" />
        )}
        {isOpen ? "Close Assistant" : "AI Shopping Assistant"}
      </button>

      {/* Conditionally rendered, but transcript/recommendations state lives
          in this parent component, not inside this subtree — closing the
          panel unmounts only this JSX, never the state, so reopening shows
          the same session's transcript and recommendations unchanged. */}
      <AnimatePresence>
      {isOpen && (
        <m.div
          key="ai-shopping-assistant-panel"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } }}
          transition={{ duration: 0.32 }}
          style={{ transformOrigin: "bottom right" }}
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
          className="theme-inverse fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-xl border-t border-border bg-surface shadow-[var(--shadow-float)] sm:inset-x-auto sm:top-auto sm:bottom-24 sm:right-6 sm:h-[58vh] sm:max-h-[600px] sm:w-[380px] sm:max-w-[calc(100vw-3rem)] sm:rounded-xl sm:border"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-fill text-muted"
            >
              <SparkleIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-5">AI Shopping Assistant</h2>
              <p className="text-xs leading-4 text-muted text-pretty">Recommends products from the Nexora catalog</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant panel"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-fill hover:text-foreground"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
                <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
              </svg>
            </button>
          </div>

          {/* overscroll-contain: scrolling the conversation to its end never
              carries on into the page behind the panel. */}
          <div
            ref={scrollAreaRef}
            onScroll={(event) => {
              const area = event.currentTarget;
              stickToBottomRef.current =
                area.scrollHeight - area.scrollTop - area.clientHeight < STICK_TO_BOTTOM_THRESHOLD;
            }}
            className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            <ul className="flex flex-col gap-4">
              {transcript.length === 0 && (
                <li className="flex flex-col gap-3 text-sm">
                  <p className="text-muted">
                    Tell me what you&apos;re looking for, and I&apos;ll find matching products.
                  </p>
                  {/* Plain quoted text, not boxes: these are examples to type,
                      not controls, and must not look clickable. */}
                  <p className="text-muted">
                    <span className="text-xs font-medium text-subtle">Try:</span>{" "}
                    <span className="italic">&ldquo;A laptop for work&rdquo;</span> ·{" "}
                    <span className="italic">&ldquo;Shoes under $80&rdquo;</span>
                  </p>
                </li>
              )}

              {transcript.map((message) => (
                <m.li
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  {message.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-foreground px-3.5 py-2 text-sm leading-relaxed text-background [overflow-wrap:anywhere]">
                      {message.text}
                    </p>
                  ) : (
                    <div
                      className={`max-w-[90%] rounded-lg rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] ${
                        message.kind === "error" ? "border border-border text-danger" : "bg-fill"
                      }`}
                    >
                      {message.kind === "ok" && (
                        <>
                          <p>{message.text}</p>
                          {/* Conversational text only — no ProductCard here.
                              The product name shown is the authoritative
                              product.name, not assistant-invented text. */}
                          {message.recommendations.length > 0 && (
                            <ul className="mt-3 flex flex-col gap-2.5 border-t border-border pt-3">
                              {message.recommendations.map((rec) => (
                                <li key={rec.product.id} className="flex flex-col gap-0.5">
                                  <span className="text-[13px] font-medium leading-snug text-foreground">
                                    {rec.product.name}
                                  </span>
                                  <span className="text-xs leading-relaxed text-muted">{rec.reason}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      {message.kind === "no_results" && <p>{message.text}</p>}
                      {message.kind === "error" && (
                        <p className="flex items-start gap-2">
                          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="mt-0.5 size-4 shrink-0">
                            <circle cx="10" cy="10" r="7.25" />
                            <path d="M10 6.5v4M10 13.5h.01" />
                          </svg>
                          <span>{message.error}</span>
                        </p>
                      )}
                    </div>
                  )}
                </m.li>
              ))}

              {/* Once the first chunk arrives, the reply itself replaces the
                  loading dots: same bubble as a finished reply, marked busy
                  and not a live region (the final text is announced once, via
                  the status region below). The small dot only marks "still
                  generating"; the text appears as fast as the server sends it. */}
              {isPending && streamingText && (
                <m.li
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    aria-busy="true"
                    className="max-w-[90%] rounded-lg rounded-bl-sm bg-fill px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]"
                  >
                    <p>
                      {streamingText}
                      <span
                        aria-hidden="true"
                        className="ml-1 inline-block size-1.5 -translate-y-px animate-pulse rounded-full bg-current align-middle opacity-60 motion-reduce:animate-none"
                      />
                    </p>
                  </div>
                </m.li>
              )}

              {isPending && !streamingText && (
                <li className="flex justify-start">
                  <div
                    role="status"
                    className="rounded-lg rounded-bl-sm bg-fill px-3.5 py-2.5 text-sm text-muted"
                  >
                    <span className="sr-only">Assistant is replying</span>
                    {/* Three dots bouncing in sequence (staggered delays);
                        static for users who prefer reduced motion.
                        animate-bounce moves an element by 25% of its own
                        height, so each dot sits at the bottom of a taller
                        wrapper that does the bouncing — a 20px wrapper
                        gives a clearly visible ~5px hop instead of ~1.5px. */}
                    <span aria-hidden="true" className="flex h-5 items-end gap-1.5">
                      {["-0.4s", "-0.2s", "0s"].map((delay) => (
                        <span
                          key={delay}
                          style={{ animationDelay: delay }}
                          className="flex h-5 animate-bounce items-end motion-reduce:animate-none"
                        >
                          <span className="size-2 rounded-full bg-current" />
                        </span>
                      ))}
                    </span>
                  </div>
                </li>
              )}

            </ul>
            <p role="status" className="sr-only">
              {announcement}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-3">
            {/* One composer: the prompt and the send button share a single
                field-style border, and the focus ring follows focus inside it. */}
            <div className="flex items-end gap-1.5 rounded-md border border-input bg-surface p-1 transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)] has-[textarea:disabled]:bg-fill">
              {/* Wraps long prompts; grows with its content up to max-h-32,
                  then scrolls vertically. Enter sends through the form's own
                  submit (handleSubmit), Shift+Enter inserts a new line, and
                  Enter while an IME composition is active is left alone. */}
              <textarea
                ref={inputRef}
                rows={1}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={MAX_INPUT_LENGTH}
                disabled={isPending}
                placeholder="Ask for product recommendations…"
                aria-label="Shopping request"
                className="max-h-32 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm leading-5 text-foreground outline-none placeholder:truncate placeholder:text-subtle disabled:cursor-not-allowed disabled:text-muted"
              />
              <button
                type="submit"
                disabled={isPending || inputValue.trim().length === 0}
                aria-label={isPending ? "Replying…" : "Send"}
                title={isPending ? "Replying…" : "Send"}
                className="btn btn-primary size-9 shrink-0 p-0"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 hidden px-1 text-[11px] text-subtle sm:block">
              Enter to send · Shift + Enter for a new line
            </p>
          </form>
        </m.div>
      )}
      </AnimatePresence>
    </>
  );
}

function SparkleIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6L10 2.5zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  );
}
