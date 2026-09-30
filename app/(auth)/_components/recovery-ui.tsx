import type { ReactNode } from "react";

// Shared chrome for the password recovery screens (/forgot-password and
// /reset-password): a three-step progress indicator and a consistent header.

const STEPS = ["Email", "Verify code", "New password"] as const;

// `current` is 1-based; pass STEPS.length + 1 once every step is complete.
export function RecoverySteps({ current }: { current: number }) {
  return (
    <ol aria-label="Password reset progress" className="grid grid-cols-3 gap-2">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;

        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <span
              aria-hidden="true"
              className={`h-1 rounded-full transition-colors ${
                done || active ? "bg-foreground" : "bg-border"
              }`}
            />
            <span
              className={`truncate text-[0.6875rem] font-medium tracking-wide uppercase ${
                active ? "text-foreground" : "text-subtle"
              }`}
            >
              {label}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Tone = "neutral" | "success" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-fill text-foreground",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function RecoveryHeader({
  icon,
  tone = "neutral",
  title,
  children,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span
        aria-hidden="true"
        className={`grid size-10 place-items-center rounded-md border ${TONE_CLASSES[tone]}`}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <div className="text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function MailIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </Icon>
  );
}

export function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function KeyIcon() {
  return (
    <Icon>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5 16.5 10.5" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 10" />
    </Icon>
  );
}

export function AlertIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </Icon>
  );
}

export function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
