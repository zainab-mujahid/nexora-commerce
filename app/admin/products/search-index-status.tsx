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
    className: "badge-success",
  },
  missing: {
    label: "Missing",
    className: "badge-warning",
  },
  out_of_date: {
    label: "Out of date",
    className: "badge-warning",
  },
  repair_failed: {
    label: "Repair failed",
    className: "badge-danger",
  },
  unavailable: {
    label: "Unavailable",
    className: "",
  },
};

const ACTION: Partial<Record<SearchIndexDisplayStatus, string>> = {
  missing: "Generate",
  out_of_date: "Update",
  repair_failed: "Retry",
};

const FEEDBACK_CLASS: Record<RepairProductEmbeddingResult["status"], string> = {
  repaired: "text-success",
  already_current: "text-muted",
  failed: "text-danger",
  superseded: "text-muted",
  not_found: "text-muted",
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
          className={`badge ${badge.className}`}
        >
          {badge.label}
        </span>
        {action && (
          <button
            type="button"
            onClick={repair}
            disabled={pending}
            className="link-action whitespace-nowrap text-xs"
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
