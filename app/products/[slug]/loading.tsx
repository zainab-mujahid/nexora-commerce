export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:flex-row sm:px-6"
      aria-hidden="true"
    >
      <div className="aspect-square w-full animate-pulse rounded-md bg-black/5 dark:bg-white/5 sm:w-80 sm:shrink-0" />
      <div className="flex flex-1 flex-col gap-4">
        <div className="h-3 w-24 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        <div className="h-7 w-2/3 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        <div className="h-5 w-32 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        <div className="h-20 w-full animate-pulse rounded bg-black/5 dark:bg-white/5" />
      </div>
    </main>
  );
}
