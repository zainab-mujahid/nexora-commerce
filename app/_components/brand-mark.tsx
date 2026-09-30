// Nexora's logo mark: a monochrome rounded tile with an "N" drawn as one
// continuous stroke and a small accent spark. Decorative — every use sits
// next to the visible "Nexora" wordmark.
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <path
        d="M10 22V10.5l12 11V10"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
      />
      <circle cx="24.5" cy="7.5" r="2.25" className="fill-accent" />
    </svg>
  );
}
