// Product image binaries live in S3 (Steps 9-11) and no upload flow exists
// yet, so every product renders this placeholder regardless of whether its
// product_images rows are populated — there is no URL to construct until
// Step 11 defines how s3_key maps to a public URL.
export function ProductImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-black/5 text-foreground/25 dark:bg-white/5 ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-8 w-8"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5-11 11" />
      </svg>
    </div>
  );
}
