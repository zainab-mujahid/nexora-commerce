// Shown by ProductImageDisplay (Step 11) when a product has no
// product_images rows yet.
export function ProductImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-fill text-subtle ${className}`}
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
