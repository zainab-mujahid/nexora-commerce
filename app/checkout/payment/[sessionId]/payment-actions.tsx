"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

import { LockIcon } from "@/app/_components/test-mode-badge";
import { cancelCheckout, checkPaymentAgain, resumeSecurePayment } from "@/lib/checkout/actions";

const Spinner = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 motion-safe:animate-spin">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
    <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

function Message({ state }: { state: { error?: string; notice?: string } | undefined }) {
  const text = state?.error ?? (state?.notice && state.notice !== "checked" ? state.notice : undefined);
  if (!text) return null;
  return (
    <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${state?.error ? "border-danger/40 text-red-600 dark:text-red-400" : "border-border text-muted"}`}>
      {text}
    </p>
  );
}

// Resume / cancel / re-check for an open checkout. Every button calls a
// Server Action that re-verifies with the payment provider; nothing here
// decides payment state.
export function OpenCheckoutActions({
  checkoutSessionId,
  providerLabel,
  canResume,
  canCancel,
  autoCheck,
  cancelLabel = "Cancel checkout",
}: {
  checkoutSessionId: string;
  providerLabel: string;
  canResume: boolean;
  canCancel: boolean;
  // Re-check with the provider a few times while it is still processing.
  autoCheck: boolean;
  cancelLabel?: string;
}) {
  const [resumeState, resume, resuming] = useActionState(resumeSecurePayment.bind(null, checkoutSessionId), undefined);
  const [cancelState, cancel, cancelling] = useActionState(cancelCheckout.bind(null, checkoutSessionId), undefined);
  const [checkState, check, checking] = useActionState(checkPaymentAgain.bind(null, checkoutSessionId), undefined);
  const busy = resuming || cancelling || checking;

  const checks = useRef(0);
  useEffect(() => {
    if (!autoCheck || checks.current >= 6) return;
    const timer = setTimeout(() => {
      checks.current += 1;
      startTransition(() => check(new FormData()));
    }, 5000);
    return () => clearTimeout(timer);
  }, [autoCheck, check, checkState]);

  return (
    <div className="flex w-full flex-col gap-3">
      <Message state={resumeState ?? cancelState ?? checkState} />
      {canResume && (
        <form action={resume}>
          <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
            {resuming ? <Spinner /> : <LockIcon />}
            {resuming ? `Opening ${providerLabel}…` : "Continue to secure payment"}
          </button>
        </form>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <form action={check}>
          <button type="submit" disabled={busy} className="link-action inline-flex items-center gap-1.5">
            {checking && <Spinner />}
            {checking ? "Checking with the payment provider…" : "I've paid — check again"}
          </button>
        </form>
        {canCancel && (
          <form action={cancel}>
            <button type="submit" disabled={busy} className="link-action inline-flex items-center gap-1.5 text-muted">
              {cancelling && <Spinner />}
              {cancelling ? "Cancelling…" : cancelLabel}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
