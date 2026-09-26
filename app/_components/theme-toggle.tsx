"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY, type Theme } from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function preferredTheme(): Theme {
  return readStoredTheme() ?? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
}

// Switches the attribute with CSS transitions suspended for one frame, so
// elements that carry transition-colors (cards, links) change in step with
// everything else instead of fading behind it.
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === theme) return;
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(pause);
  root.setAttribute("data-theme", theme);
  void window.getComputedStyle(document.body).opacity; // force the restyle
  requestAnimationFrame(() => pause.remove());
}

// The <html> attribute is the single source of truth; the toggle only
// observes it. The server snapshot is null (the server can't know the
// theme), so the first client render matches the server HTML and React
// re-renders with the real value right after hydration — no mismatch.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getSnapshot = () => document.documentElement.getAttribute("data-theme") as Theme | null;
const getServerSnapshot = () => null;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The inline <head> script already set the attribute on a full load. This
  // re-applies it in development, where Strict Mode's remount resets <html>
  // to the attributes React manages; in production it's a no-op.
  useLayoutEffect(() => {
    applyTheme(preferredTheme());
  }, []);

  // Keep following the OS until the user makes an explicit choice, and pick
  // up a choice made in another tab.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const sync = () => applyTheme(preferredTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle() {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the switch still applies for this page view.
    }
  }

  const label =
    theme === null ? "Toggle color theme" : theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  // Both icons are always rendered and swapped purely by the dark: variant,
  // so the right one shows from first paint (before hydration) and the
  // fixed-size button never shifts when it changes.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-black/15 text-foreground/70 transition-colors hover:bg-black/[.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60 dark:border-white/20 dark:hover:bg-white/[.06] ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 dark:hidden"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden size-4 dark:block"
      >
        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
      </svg>
    </button>
  );
}
