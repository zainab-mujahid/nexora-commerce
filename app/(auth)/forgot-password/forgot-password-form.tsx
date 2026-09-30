"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { TextField } from "@/app/_components/text-field";
import {
  cancelPasswordReset,
  requestPasswordReset,
  resendRecoveryCode,
  verifyRecoveryCode,
} from "@/lib/auth/password-recovery";
import {
  RECOVERY_CODE_LENGTH,
  type ForgotPasswordState,
  type PendingRecovery,
  type ResendRecoveryCodeState,
  type VerifyRecoveryCodeState,
} from "@/lib/auth/schemas";

import {
  LockIcon,
  MailIcon,
  RecoveryHeader,
  RecoverySteps,
  ShieldIcon,
} from "../_components/recovery-ui";
import { CodeInput } from "./code-input";

// Supabase's default minimum interval between emails to the same user. Only
// paces the button so it isn't pressed into Supabase's own limit — Supabase
// enforces the real one.
const RESEND_COOLDOWN_SECONDS = 60;

const CONNECTION_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";

export function ForgotPasswordFlow({
  initialRequest,
}: {
  initialRequest: PendingRecovery | null;
}) {
  const [request, setRequest] = useState(initialRequest);

  if (request) {
    return (
      <VerifyCodeStep
        key={request.email}
        request={request}
        onResent={setRequest}
        onStartOver={() => setRequest(null)}
      />
    );
  }

  return <EmailStep onSent={setRequest} />;
}

function EmailStep({ onSent }: { onSent: (request: PendingRecovery) => void }) {
  const [state, setState] = useState<ForgotPasswordState>();
  const [pending, startSending] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSending(async () => {
      try {
        const result = await requestPasswordReset(undefined, formData);
        if (result?.sent) onSent(result.sent);
        else setState(result);
      } catch {
        setState({ message: CONNECTION_ERROR });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <RecoverySteps current={1} />
      <RecoveryHeader icon={<MailIcon />} title="Forgot your password?">
        <p>
          Enter the email associated with your account and we&apos;ll send you
          a {RECOVERY_CODE_LENGTH}-digit verification code.
        </p>
      </RecoveryHeader>

      <TextField
        label="Email"
        name="email"
        type="email"
        placeholder="name@example.com"
        autoComplete="email"
        errors={state?.errors?.email}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Sending code…" : "Send verification code"}
      </button>

      <p className="text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function VerifyCodeStep({
  request,
  onResent,
  onStartOver,
}: {
  request: PendingRecovery;
  onResent: (request: PendingRecovery) => void;
  onStartOver: () => void;
}) {
  const [code, setCode] = useState("");
  const [state, verifyAction, verifying] = useActionState<
    VerifyRecoveryCodeState,
    FormData
  >(verifyRecoveryCode, undefined);
  // The verify result the user has since edited the code past, so a stale
  // error stops showing once they start correcting it.
  const [dismissedState, setDismissedState] =
    useState<VerifyRecoveryCodeState>();
  const [resendState, setResendState] = useState<ResendRecoveryCodeState>();
  const [resending, startResending] = useTransition();
  const [leaving, startLeaving] = useTransition();
  const secondsLeft = useSecondsUntil(
    request.sentAt + RESEND_COOLDOWN_SECONDS * 1000,
    RESEND_COOLDOWN_SECONDS,
  );

  const verifyState = state === dismissedState ? undefined : state;
  const codeErrors = verifyState?.errors?.code;
  const mustRestart = Boolean(verifyState?.restart || resendState?.restart);
  const busy = verifying || resending || leaving;

  // Submitting moves focus to the button; put it back on the code so a
  // mistyped digit can be fixed straight away.
  useEffect(() => {
    if (state?.errors?.code) document.getElementById("code")?.focus();
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Dispatched manually (rather than via <form action>) so React doesn't
    // reset the form afterwards and wipe a code the user may only need to
    // correct by one digit.
    const formData = new FormData(event.currentTarget);
    startTransition(() => verifyAction(formData));
  }

  function handleResend() {
    startResending(async () => {
      try {
        const result = await resendRecoveryCode();
        setResendState(result);
        if (result?.sent) {
          // The previous code no longer works; start fresh with the new one.
          setCode("");
          setDismissedState(state);
          onResent(result.sent);
        }
      } catch {
        setResendState({ message: CONNECTION_ERROR });
      }
    });
  }

  function handleStartOver() {
    startLeaving(async () => {
      try {
        await cancelPasswordReset();
      } catch {
        // The pending-request cookie expires on its own; the next request
        // overwrites it anyway.
      }
      onStartOver();
    });
  }

  if (mustRestart) {
    return (
      <div className="flex flex-col gap-5">
        <RecoverySteps current={2} />
        <RecoveryHeader icon={<ShieldIcon />} title="Request expired">
          <p role="alert">
            {verifyState?.message ?? resendState?.message}
          </p>
        </RecoveryHeader>
        <button
          type="button"
          onClick={handleStartOver}
          disabled={leaving}
          className="btn btn-primary"
        >
          {leaving ? "One moment…" : "Start over"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RecoverySteps current={2} />
      <RecoveryHeader icon={<ShieldIcon />} title="Check your email">
        <p role="status">
          If an account exists for{" "}
          <span className="font-medium [overflow-wrap:anywhere] text-foreground">
            {request.email}
          </span>
          , we&apos;ve sent a verification code. Enter it below to continue.
        </p>
      </RecoveryHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="field-label">
            Verification code
          </label>
          <CodeInput
            id="code"
            name="code"
            length={RECOVERY_CODE_LENGTH}
            value={code}
            onChange={(next) => {
              setCode(next);
              if (state !== dismissedState) setDismissedState(state);
            }}
            invalid={Boolean(codeErrors)}
            describedBy={codeErrors ? "code-error" : "code-hint"}
            autoFocus
          />
          {codeErrors ? (
            <p id="code-error" role="alert" className="text-xs text-danger">
              {codeErrors[0]}
            </p>
          ) : (
            <p id="code-hint" className="text-xs text-muted">
              Enter the {RECOVERY_CODE_LENGTH}-digit code from the email. You
              can paste it.
            </p>
          )}
        </div>

        {verifyState?.message && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {verifyState.message}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary">
          {verifying ? "Verifying…" : "Verify code"}
        </button>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-muted">Didn&apos;t get it?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || secondsLeft !== 0}
            className="link-action text-sm tabular-nums"
          >
            {resending
              ? "Sending…"
              : secondsLeft
                ? `Resend code in ${formatSeconds(secondsLeft)}`
                : "Resend code"}
          </button>
        </div>

        {resendState?.sent && (
          <p
            role="status"
            className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground"
          >
            If an account exists for this email, we&apos;ve sent a new code.
            Earlier codes no longer work.
          </p>
        )}
        {resendState?.message && !resendState.restart && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {resendState.message}
          </p>
        )}

        <p className="text-xs text-muted">
          Check your spam folder if it hasn&apos;t arrived. Wrong address?{" "}
          <button
            type="button"
            onClick={handleStartOver}
            disabled={busy}
            className="link-action text-xs"
          >
            Use a different email
          </button>
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-md bg-fill px-3 py-2.5 text-xs text-muted">
        <span className="mt-px shrink-0">
          <LockIcon />
        </span>
        Never share this code. Nexora will never ask you for it by phone, chat
        or email.
      </p>

      <p className="text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

// Whole seconds until `target` (epoch ms), capped at `max` so a client clock
// that disagrees with the server's can't stretch the wait. null until mounted,
// so the server render and hydration agree.
function useSecondsUntil(target: number, max: number) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  if (now === null) return null;
  return Math.min(max, Math.max(0, Math.ceil((target - now) / 1000)));
}

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
