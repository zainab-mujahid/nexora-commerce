"use client";

import { useSearchParams } from "next/navigation";

// Thank-you banner for the visit right after checkout. `?placed=1` only
// decides WHETHER to greet (it comes from our own redirect after
// verification); `paid` comes from the order row in the database, so a
// hand-typed ?placed=1 can never make an unpaid order look paid.
//
// useSearchParams() reads the client router's current URL, which is what the
// address bar shows after the server-side redirect's soft navigation.
export function PlacedBanner({ paid }: { paid: boolean }) {
  const searchParams = useSearchParams();
  if (searchParams.get("placed") !== "1" || !paid) return null;

  return (
    <p className="flex gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0 text-success">
        <circle cx="10" cy="10" r="7.5" />
        <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
      </svg>
      <span>
        <strong className="font-semibold">Payment confirmed — thank you for your order.</strong> We&apos;ll get it ready and
        you can follow its status here.
      </span>
    </p>
  );
}
