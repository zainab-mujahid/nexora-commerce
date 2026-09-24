"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  repairProductEmbedding,
  type RepairProductEmbeddingResult,
} from "@/lib/admin/products";
import type { ProductEmbeddingStatus } from "@/lib/ai/product-embedding-status";

// "unavailable": the status couldn't be determined (status read failed, or
// the product's category couldn't be read) — shown neutrally, never as up
// to date, and never offered a repair.
export type SearchIndexDisplayStatus = ProductEmbeddingStatus | "unavailable";

const BADGE: Record<SearchIndexDisplayStatus, { label: string; className: string }> = {
  up_to_date: {
    label: "Up to date",
    className: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
  },
  missing: {
    label: "Missing",
    className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  out_of_date: {
    label: "Out of date",
    className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  repair_failed: {
    label: "Repair failed",
    className: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  },
  unavailable: {
    label: "Unavailable",
    className: "border-black/15 text-foreground/60 dark:border-white/20",
  },
};

const ACTION: Partial<Record<SearchIndexDisplayStatus, string>> = {
  missing: "Generate",
  out_of_date: "Update",
  repair_failed: "Retry",
};

const FEEDBACK_CLASS: Record<RepairProductEmbeddingResult["status"], string> = {
  repaired: "text-green-700 dark:text-green-400",
  already_current: "text-foreground/60",
  failed: "text-red-600",
  superseded: "text-foreground/60",
  not_found: "text-foreground/60",
};

// One product's search-index status in the admin list, with a repair button
// only when a repair makes sense. `status` comes from the server (Phase C)
// and is for display only: the button sends just the product id, and the
// server re-decides whether anything needs doing. After every outcome the
// route is refreshed once so the badge shows the server's current status;
// the message stays here (this component stays mounted) even when the
// button disappears because the product is now up to date.
export function SearchIndexStatus({
  productId,
  status,
}: {
  productId: string;
  status: SearchIndexDisplayStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RepairProductEmbeddingResult | null>(null);
  // Blocks a second click that lands before the disabled state renders.
  const inFlight = useRef(false);

  const badge = BADGE[status];
  const action = ACTION[status];

  function repair() {
    if (inFlight.current) return;
    inFlight.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await repairProductEmbedding(productId));
      } catch {
        setResult({ status: "failed", message: "Couldn't update the search index. Please try again later." });
      } finally {
        inFlight.current = false;
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        {action && (
          <button
            type="button"
            onClick={repair}
            disabled={pending}
            className="whitespace-nowrap text-xs font-medium underline-offset-2 hover:underline disabled:opacity-60 disabled:no-underline"
          >
            {pending ? "Updating…" : action}
          </button>
        )}
      </div>
      <p role="status" className={`text-xs ${result ? FEEDBACK_CLASS[result.status] : ""}`}>
        {result?.message}
      </p>
    </div>
  );
}
