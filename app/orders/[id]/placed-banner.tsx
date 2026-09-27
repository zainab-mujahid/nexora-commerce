"use client";

import { useSearchParams } from "next/navigation";

// placeOrder() redirects here with `?placed=1` (see lib/checkout/actions.ts).
// That redirect runs inside a Server Action, and Next.js performs a
// client-side (soft) navigation for it whenever JS is available — this
// page's server `searchParams` prop reflects whatever the client router's
// RSC fetch resolved for that navigation, not necessarily the exact live
// browser URL. useSearchParams() instead reads directly off the client
// router's current URL state, which is what the address bar actually shows,
// so it can't drift from it across either a hard or soft navigation.
export function PlacedBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("placed") !== "1") return null;

  return (
    <p className="flex gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0 text-success">
        <circle cx="10" cy="10" r="7.5" />
        <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
      </svg>
      <span>
        Thanks for your order — we&apos;ll get it ready. This order is unpaid pending
        payment integration; no payment has been charged.
      </span>
    </p>
  );
}
