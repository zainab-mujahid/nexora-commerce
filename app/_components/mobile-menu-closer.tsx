"use client";

import { useEffect, useRef } from "react";

// Rendered inside the header's JS-free <details> mobile menu. Client-side
// navigation doesn't re-render the (server) header, so without this the menu
// would stay open over the next page. Closes it when a link inside is
// followed or its search is submitted, and on Escape (returning focus to the
// Menu button). Renders nothing visible; the menu still works without JS.
export function MobileMenuCloser() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const details = ref.current?.closest("details");
    if (!details) return;
    const close = () => {
      details.open = false;
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        close();
        details.querySelector("summary")?.focus();
      }
    };
    details.addEventListener("click", onClick);
    details.addEventListener("submit", close);
    details.addEventListener("keydown", onKeyDown);
    return () => {
      details.removeEventListener("click", onClick);
      details.removeEventListener("submit", close);
      details.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <span ref={ref} hidden />;
}
