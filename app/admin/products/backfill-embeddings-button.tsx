"use client";

import { useActionState } from "react";

import { backfillProductEmbeddings } from "@/lib/admin/products";

// Admin ops control, not a customer-facing AI feature — one bounded batch
// (see EMBEDDING_BACKFILL_BATCH_LIMIT in lib/admin/products.ts) per click;
// click again if the reported "still need an embedding" count is nonzero.
export function BackfillEmbeddingsButton() {
  const [state, formAction, pending] = useActionState(backfillProductEmbeddings, undefined);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:opacity-70 disabled:opacity-60 dark:border-white/20"
      >
        {pending ? "Backfilling…" : "Backfill missing embeddings"}
      </button>
      {state?.message && (
        <span className="text-sm text-foreground/60">{state.message}</span>
      )}
    </form>
  );
}
