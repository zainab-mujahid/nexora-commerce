"use client";

import { useEffect } from "react";

import { RouteError } from "@/app/_components/route-error";

// error.tsx wraps this whole segment, including nested app/products/[slug],
// so this one boundary covers both the list and detail pages.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RouteError retry={retry} />;
}
