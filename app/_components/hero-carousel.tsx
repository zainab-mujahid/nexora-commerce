"use client";

import { m } from "motion/react";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Reveal } from "./motion/reveal";
import { EASE } from "./motion/tokens";

// Decorative background artwork for the home hero (public/images). Each slide
// carries its own crop: phones show a narrow vertical slice of the wide image
// (the copy spans the width there, over an even scrim), while from 768px the
// copy keeps to the left half, so the crop favors the products on the right.
const HERO_SLIDES = [
  {
    src: "/images/hero-electronics.webp",
    position: "object-[58%_50%] md:object-[75%_55%] lg:object-[100%_60%]",
  },
  {
    src: "/images/hero-fashion.webp",
    position: "object-[38%_50%] md:object-[70%_45%] lg:object-[100%_45%]",
  },
  {
    src: "/images/hero-home.webp",
    position: "object-[62%_50%] md:object-[75%_55%] lg:object-[100%_60%]",
  },
] as const;

// Long enough to take each photo in; the crossfade itself is slow and soft.
const SLIDE_INTERVAL_MS = 5000;
const FADE_SECONDS = 1.2;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
// Server snapshot false: rotation only starts once the client knows motion is
// allowed, so the server and hydration render slide 1 either way.
const canAnimate = () => !window.matchMedia(REDUCED_MOTION).matches;
const canAnimateOnServer = () => false;

// Rendered in place of the hero's single banner image: same absolute layer,
// same slow zoom-out on mount, under the unchanged overlay and copy. Slide 1
// is server-rendered fully visible (no blank frame before hydration) and the
// others sit transparent on top of it, so a change is a pure opacity
// crossfade in one fixed box — nothing around it moves. Auto-rotation only
// advances to a slide whose image has finished loading; with
// prefers-reduced-motion it doesn't rotate at all, and the dots still switch
// slides (instantly).
export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<boolean[]>(() => HERO_SLIDES.map(() => false));
  const animate = useSyncExternalStore(subscribe, canAnimate, canAnimateOnServer);

  // Restarts whenever the slide changes (including a dot click), so a manual
  // choice gets its full interval before rotation carries on.
  useEffect(() => {
    if (!animate) return;
    const next = (active + 1) % HERO_SLIDES.length;
    if (!loaded[next]) return;
    const timer = window.setTimeout(() => setActive(next), SLIDE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [animate, active, loaded]);

  const markLoaded = (index: number) =>
    setLoaded((prev) => (prev[index] ? prev : prev.map((value, i) => (i === index ? true : value))));

  return (
    <>
      {/* The artwork settles in with a slow, slight zoom-out. */}
      <Reveal trigger="mount" rise={0} scale={1.04} className="absolute inset-0">
        {HERO_SLIDES.map((slide, index) => (
          <m.div
            key={slide.src}
            aria-hidden="true"
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: index === active ? 1 : 0 }}
            transition={{ duration: animate ? FADE_SECONDS : 0, ease: EASE }}
          >
            <Image
              src={slide.src}
              alt=""
              fill
              unoptimized
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
              onLoad={() => markLoaded(index)}
              className={`object-cover ${slide.position}`}
            />
          </m.div>
        ))}
      </Reveal>
      {/* A faint pill in the banner's own dark token keeps the dots visible
          over the brighter photos (e.g. the cream fashion backdrop). */}
      <div
        role="group"
        aria-label="Hero images"
        className="absolute bottom-3 right-4 z-10 flex items-center rounded-full bg-background/45 px-1 ring-1 ring-foreground/10 sm:bottom-4 sm:right-6"
      >
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Show image ${index + 1} of ${HERO_SLIDES.length}`}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
            className="group/dot flex size-6 items-center justify-center rounded-full focus-visible:-outline-offset-2"
          >
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-nexora)] ${
                index === active ? "w-4 bg-foreground/90" : "w-1.5 bg-foreground/40 group-hover/dot:bg-foreground/70"
              }`}
            />
          </button>
        ))}
      </div>
    </>
  );
}
