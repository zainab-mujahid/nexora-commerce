"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// One-time "payment received" confirmation for the visit right after
// checkout. Two independent conditions:
//   - `confirmed` comes from the DATABASE (server-rendered): the order's own
//     payment is 'paid' and was verified moments ago — failed, pending,
//     cancelled, expired, refunded, partially refunded and under-review
//     orders can never get it, and neither can an old paid order;
//   - `?placed=1` (set only by our own redirect after verification) decides
//     whether this visit is the one to greet.
// The parameter is then removed from the address bar, so a refresh, the back
// button or a later visit shows the ordinary Paid status instead.
export function PlacedBanner({ confirmed }: { confirmed: boolean }) {
  const searchParams = useSearchParams();
  // Captured once: removing the parameter below must not hide the banner.
  const [show] = useState(() => confirmed && searchParams.get("placed") === "1");

  useEffect(() => {
    if (searchParams.get("placed") !== "1") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("placed");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [searchParams]);

  if (!show) return null;

  return (
    <div role="status" className="flex items-start gap-3.5 rounded-xl border border-success/30 bg-success/10 px-4 py-4 sm:px-5">
      <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <path d="m5.5 10.5 3 3 6-7" />
        </svg>
      </span>
      <span className="flex flex-col gap-0.5">
        <strong className="text-base font-semibold tracking-tight">Payment received</strong>
        <span className="text-sm text-muted">
          Thank you for your order. Your payment has been confirmed successfully — you can follow your order&apos;s progress here.
        </span>
      </span>
    </div>
  );
}
