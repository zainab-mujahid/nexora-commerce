"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const PHRASES = [
  "Search naturally.",
  "Discover your match.",
  "Compare your options.",
  "Let AI guide your search.",
];

const TYPE_MS = 75;
const ERASE_MS = 40;
const HOLD_FULL_MS = 1800;
const HOLD_EMPTY_MS = 450;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Server snapshot false: the server (and hydration) render the static first
// phrase; motion starts only once the client knows it is allowed.
const canAnimate = () => !window.matchMedia(REDUCED_MOTION).matches;
const canAnimateOnServer = () => false;

// Decorative typewriter line under the home hero heading. The server (and
// the first client render) show the first phrase in full, so there is no
// hydration mismatch and the line is readable without JavaScript; the cycle
// starts after mount by erasing it. With prefers-reduced-motion the first
// phrase simply stays. Screen readers get all four phrases once, as static
// text — the animated copy is aria-hidden, so nothing is re-announced.
//
// Layout stays fixed: every phrase is rendered invisibly in the same grid
// cell as the live text, so the line always reserves the size of the
// longest phrase (including when it wraps on narrow screens).
export function HeroTypewriter({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(PHRASES[0].length);
  const [erasing, setErasing] = useState(true);
  const animate = useSyncExternalStore(subscribe, canAnimate, canAnimateOnServer);

  useEffect(() => {
    if (!animate) return;
    const phrase = PHRASES[index];
    let delay: number;
    let step: () => void;
    if (erasing) {
      if (length > 0) {
        delay = length === phrase.length ? HOLD_FULL_MS : ERASE_MS;
        step = () => setLength(length - 1);
      } else {
        delay = HOLD_EMPTY_MS;
        step = () => {
          setIndex((index + 1) % PHRASES.length);
          setErasing(false);
        };
      }
    } else if (length < phrase.length) {
      delay = TYPE_MS;
      step = () => setLength(length + 1);
    } else {
      delay = 0;
      step = () => setErasing(true);
    }
    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [animate, index, length, erasing]);

  // Without motion (or before hydration) the first phrase shows in full.
  const shown = animate ? PHRASES[index].slice(0, length) : PHRASES[0];

  return (
    <p className={className}>
      <span className="sr-only">{PHRASES.join(" ")}</span>
      <span aria-hidden="true" className="grid">
        {PHRASES.map((phrase) => (
          <span key={phrase} className="invisible col-start-1 row-start-1">
            {phrase}
            <span className="hero-caret" />
          </span>
        ))}
        <span className="col-start-1 row-start-1">
          {shown}
          <span className={animate ? "hero-caret hero-caret-blink" : "hero-caret invisible"} />
        </span>
      </span>
    </p>
  );
}
