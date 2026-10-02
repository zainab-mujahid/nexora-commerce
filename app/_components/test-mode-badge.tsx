// Shown wherever a payment step is visible while the payment provider runs in
// its sandbox: makes it unmistakable that no real money moves.
export function TestModeBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`badge badge-warning inline-flex items-center gap-1.5 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <path d="M6 2.5h4M6.75 2.5v3.6L3.2 12a1.3 1.3 0 0 0 1.1 2h7.4a1.3 1.3 0 0 0 1.1-2L9.25 6.1V2.5" />
        <path d="M4.6 10h6.8" />
      </svg>
      Test mode · No real charge
    </span>
  );
}

export function LockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="8.5" width="12" height="8.5" rx="2" />
      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
    </svg>
  );
}
