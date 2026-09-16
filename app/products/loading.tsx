import { ProductGridSkeleton } from "@/app/_components/product-grid";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="h-8 w-24 animate-pulse rounded bg-black/5 dark:bg-white/5" />
      <ProductGridSkeleton />
    </main>
  );
}
