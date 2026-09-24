// The product-search text field used by every storefront search form (the
// header's, and /products'). It renders only the input and a submit button
// inside it: the enclosing <form action="/products"> stays the single
// submission path, so pressing Enter and clicking the icon send exactly the
// same GET request (?q=…, plus whatever other fields that form carries).
export function ProductSearchInput({
  className = "",
  defaultValue,
}: {
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search products…"
        aria-label="Search products"
        className="w-full rounded-md border border-black/15 bg-transparent py-1.5 pl-3 pr-9 text-sm outline-none focus:border-foreground/50 dark:border-white/20"
      />
      <button
        type="submit"
        aria-label="Search products"
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-foreground/50 hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground/40"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="size-4"
        >
          <circle cx="8.5" cy="8.5" r="5.25" />
          <path d="m12.5 12.5 4 4" />
        </svg>
      </button>
    </div>
  );
}
