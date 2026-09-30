import Link from "next/link";

import { Reveal } from "./motion/reveal";

export function RouteNotFound({
  message,
  backHref = "/products",
  backLabel = "Back to shop",
}: {
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
      <div aria-hidden="true" className="surface-grid absolute inset-0 -z-10" />
      <Reveal trigger="mount" scale={0.985} className="flex flex-col items-center gap-4">
        <span aria-hidden="true" className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-surface text-accent shadow-[var(--shadow-card)] ring-1 ring-border">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5M8.5 10.5h4" />
          </svg>
        </span>
        <h1 className="display-title text-2xl sm:text-3xl">Not found</h1>
        <p className="max-w-sm text-sm text-muted">{message}</p>
        <Link
          href={backHref}
          className="btn btn-primary"
        >
          {backLabel}
        </Link>
      </Reveal>
    </div>
  );
}
