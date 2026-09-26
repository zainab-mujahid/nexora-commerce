"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  repairProductSearchIndex,
  type RepairProductSearchIndexResult,
} from "@/lib/admin/products";

// Runs one bounded bulk repair (repairProductSearchIndex) of the products
// whose search index needs attention. `needsAttention` comes from the
// server's canonical status summary and only decides whether the button is
// offered; the server picks the products itself. After every outcome the
// route is refreshed once so the counts and rows are re-derived; the
// summary stays here (this component stays mounted) until the next run.
export function RepairSearchIndexButton({ needsAttention }: { needsAttention: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RepairProductSearchIndexResult | null>(null);
  // Blocks a second click that lands before the disabled state renders.
  const inFlight = useRef(false);

  function repair() {
    if (inFlight.current) return;
    inFlight.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await repairProductSearchIndex());
      } catch {
        setResult({
          status: "unavailable",
          message: "Couldn't run the search index repair. Please try again later.",
        });
      } finally {
        inFlight.current = false;
        router.refresh();
      }
    });
  }

  // Green only for a run that finished everything it found; a run with
  // failures is red; anything partial (stopped early, changed during the
  // run, work remaining, status unavailable) stays neutral.
  const feedbackClass = !result
    ? ""
    : result.status === "completed" && result.failed > 0
      ? "text-danger"
      : result.status === "completed" &&
          result.stoppedReason === "complete" &&
          result.superseded === 0 &&
          result.remaining === 0
        ? "text-success"
        : "text-muted";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={repair}
          disabled={pending || needsAttention === 0}
          className="btn btn-secondary"
        >
          {pending ? "Repairing…" : "Repair search index"}
        </button>
        <p className="text-xs text-muted">
          {needsAttention === 0
            ? "Nothing needs repair."
            : "Repairs a limited batch of the products listed as Missing, Out of date or Repair failed. Up-to-date products are skipped. Run again to continue if more remain."}
        </p>
      </div>
      <p role="status" className={`text-sm ${feedbackClass}`}>
        {result?.message}
      </p>
    </div>
  );
}
