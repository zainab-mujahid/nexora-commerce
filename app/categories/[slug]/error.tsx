"use client";

import { useEffect } from "react";

import { RouteError } from "@/app/_components/route-error";

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
