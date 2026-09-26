import { ProductGridSkeleton } from "@/app/_components/product-grid";

// Mirrors the loaded page's structure (heading, toolbar, category pills,
// section heading, grid) so the swap to real content doesn't shift layout.
export default function Loading() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 motion-safe:animate-pulse sm:px-6 sm:py-14"
    >
      <div className="flex flex-col gap-2">
        <div className="h-9 w-28 rounded bg-fill sm:h-10" />
        <div className="h-5 w-24 rounded bg-fill" />
      </div>
      <div className="h-[7.75rem] rounded-lg bg-fill sm:h-[3.875rem]" />
      <div className="flex gap-2">
        {[10, 16, 20, 16, 14].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-fill" style={{ width: `${w * 0.25}rem` }} />
        ))}
      </div>
      <div className="border-b border-border pb-4">
        <div className="h-7 w-40 rounded bg-fill" />
      </div>
      <ProductGridSkeleton />
    </main>
  );
}
