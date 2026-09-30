import { BrandMark } from "@/app/_components/brand-mark";
import { Reveal } from "@/app/_components/motion/reveal";

// Shared stage for sign in, sign up and password recovery: a faint grid and
// glow behind a single elevated card, with the brand lockup above it.
// Presentation only — each page renders its own form inside the card.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <div aria-hidden="true" className="surface-glow absolute inset-0 -z-10" />
      <div aria-hidden="true" className="surface-grid absolute inset-0 -z-10" />
      <Reveal trigger="mount" rise={18} scale={0.99} className="flex w-full max-w-sm flex-col items-center gap-6">
        <span className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <BrandMark className="size-7" />
          Nexora
        </span>
        <div className="card w-full p-6 shadow-[var(--shadow-raised)] sm:p-8">{children}</div>
      </Reveal>
    </main>
  );
}
