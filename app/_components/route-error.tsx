"use client";

import { Reveal } from "./motion/reveal";

export function RouteError({ retry }: { retry: () => void }) {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
      <div aria-hidden="true" className="surface-grid absolute inset-0 -z-10" />
      <Reveal trigger="mount" scale={0.985} className="flex flex-col items-center gap-4">
        <span aria-hidden="true" className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-surface text-accent shadow-[var(--shadow-card)] ring-1 ring-border">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
            <path d="M12 8v4.5M12 16h.01" /><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>
        <h1 className="display-title text-2xl sm:text-3xl">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted">
          We couldn&apos;t load this page right now. Please try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="btn btn-primary"
        >
          Try again
        </button>
      </Reveal>
    </div>
  );
}
