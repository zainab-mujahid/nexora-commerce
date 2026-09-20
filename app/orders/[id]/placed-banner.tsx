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
    <p className="text-sm text-foreground/60">
      Thanks for your order — we&apos;ll get it ready. This order is unpaid pending
      payment integration; no payment has been charged.
    </p>
  );
}
