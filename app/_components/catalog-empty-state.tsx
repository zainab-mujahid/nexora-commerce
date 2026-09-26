// Storefront empty state (no products / no search matches / empty
// category). Same messages as before; presentation only.
export function CatalogEmptyState({
  message,
  icon = "box",
}: {
  message: string;
  icon?: "box" | "search";
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-fill/40 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-border">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          {icon === "search" ? (
            <>
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m20 20-4.5-4.5" />
            </>
          ) : (
            <>
              <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
              <path d="m3 8 9 5 9-5M12 13v8" />
            </>
          )}
        </svg>
      </span>
      <p className="max-w-sm text-sm text-muted">{message}</p>
    </div>
  );
}
