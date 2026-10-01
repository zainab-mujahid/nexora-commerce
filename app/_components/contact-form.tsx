"use client";

import { useState, type FormEvent } from "react";

import { SUPPORT_EMAIL } from "./support-contact";

const SUBJECTS = ["Product question", "Order question", "Account assistance", "Returns", "General inquiry"] as const;

type Fields = { name: string; email: string; subject: string; message: string };

// RFC 6068: line breaks inside a mailto: body must be CRLF (%0D%0A).
const CRLF = "\r\n";

function composeBody(fields: Fields, eol: string): string {
  return [
    fields.message.trim().replace(/\r?\n/g, eol),
    "",
    "—",
    `Name: ${fields.name.trim()}`,
    `Email: ${fields.email.trim()}`,
    `Subject: ${fields.subject}`,
  ].join(eol);
}

const subjectLine = (fields: Fields) => `[Nexora] ${fields.subject}`;

// mailto: URL for the optional "open in your email app" link. Subject and
// body are encodeURIComponent-encoded, so spaces, line breaks, &, ?, # and
// non-ASCII text can't break out of their parameter.
function buildMailto(fields: Fields): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subjectLine(fields))}&body=${encodeURIComponent(composeBody(fields, CRLF))}`;
}

// Plain-text version of the same email, for pasting into Gmail, Outlook or
// any other mail service.
function composeText(fields: Fields): string {
  return [`To: ${SUPPORT_EMAIL}`, `Subject: ${subjectLine(fields)}`, "", composeBody(fields, "\n")].join("\n");
}

// navigator.clipboard needs a secure context (HTTPS or localhost); the
// execCommand path covers plain-HTTP deployments. Resolves false when
// neither works, so the caller can show the text for manual copying.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "copied-message" }
  | { kind: "copied-address" }
  | { kind: "manual"; text: string };

// Contact form for /contact. Nexora has no message-submission backend, so
// nothing is sent from this page, and opening a visitor's email app via
// mailto: depends entirely on their device having a working default email
// app — which many don't. So the reliable path is copying: "Copy message"
// (the form's submit action, so the fields are validated first) puts the
// complete email on the clipboard, and the support address can be copied on
// its own. "Open in your email app" is an optional plain mailto: link and the
// page never claims that anything opened or was sent.
export function ContactForm() {
  const [fields, setFields] = useState<Fields>({ name: "", email: "", subject: "General inquiry", message: "" });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const update = (key: keyof Fields) => (event: { target: { value: string } }) => {
    setFields((prev) => ({ ...prev, [key]: event.target.value }));
    if (status.kind !== "idle") setStatus({ kind: "idle" });
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = composeText(fields);
    setStatus((await copyText(text)) ? { kind: "copied-message" } : { kind: "manual", text });
  }

  async function copyAddress() {
    setStatus((await copyText(SUPPORT_EMAIL)) ? { kind: "copied-address" } : { kind: "manual", text: SUPPORT_EMAIL });
  }

  const ready = fields.name.trim() !== "" && fields.message.trim() !== "" && /\S+@\S+\.\S+/.test(fields.email.trim());

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-describedby="contact-form-note">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-fill/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Email us at{" "}
          <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{SUPPORT_EMAIL}</span>
        </p>
        <button type="button" onClick={copyAddress} className="btn btn-secondary h-9 shrink-0 self-start sm:self-auto">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
            <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7" />
          </svg>
          Copy email address
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input name="name" required autoComplete="name" maxLength={100} value={fields.name} onChange={update("name")} className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" maxLength={200} value={fields.email} onChange={update("email")} className="field" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Subject
        <select name="subject" value={fields.subject} onChange={update("subject")} className="field">
          {SUBJECTS.map((subject) => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Message
        <textarea name="message" required rows={6} maxLength={2000} value={fields.message} onChange={update("message")} className="field resize-y py-2" />
      </label>

      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-start sm:justify-between">
        <p id="contact-form-note" className="text-xs leading-relaxed text-subtle sm:max-w-xs">
          Messages aren&apos;t sent from this page. Copy your message and paste it into a new email to {SUPPORT_EMAIL}{" "}
          from Gmail, Outlook or any email service.
        </p>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button type="submit" className="btn btn-primary">
            Copy message
          </button>
          {/* Optional: works only when this device has a default email app. */}
          <a
            href={buildMailto(fields)}
            aria-disabled={!ready || undefined}
            onClick={(event) => {
              if (!ready) {
                event.preventDefault();
                event.currentTarget.closest("form")?.reportValidity();
              }
            }}
            className="link-action text-xs"
          >
            Or open in your email app (if one is set up)
          </a>
        </div>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {status.kind === "copied-message" && (
          <p className="rounded-lg border border-border bg-fill/50 p-4 text-sm leading-relaxed text-muted">
            <span className="font-medium text-foreground">Message copied.</span> Paste it into a new email to{" "}
            <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span> and send it from your email service.
          </p>
        )}
        {status.kind === "copied-address" && (
          <p className="rounded-lg border border-border bg-fill/50 p-4 text-sm text-muted">
            <span className="font-medium text-foreground">Email address copied:</span> {SUPPORT_EMAIL}
          </p>
        )}
        {status.kind === "manual" && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-fill/50 p-4 text-sm text-muted">
            <p>Your browser didn&apos;t allow automatic copying. Select the text below and copy it:</p>
            <textarea
              readOnly
              rows={Math.min(10, status.text.split("\n").length + 1)}
              value={status.text}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Text to copy"
              className="field resize-y py-2 font-mono text-xs"
            />
          </div>
        )}
      </div>
    </form>
  );
}
