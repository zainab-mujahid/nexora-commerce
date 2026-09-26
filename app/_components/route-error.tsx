"use client";

export function RouteError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        We couldn&apos;t load this page right now. Please try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="btn btn-primary"
      >
        Try again
      </button>
    </div>
  );
}
