"use client";

import { useRef, useState, type PointerEvent } from "react";

// A verification-code field drawn as one slot per digit. There is a single
// real <input> stretched invisibly over the slots, so typing, paste (including
// "123 456" or "123-456"), Backspace/Delete, arrow keys, selection, mobile
// numeric keypads and one-time-code autofill all behave natively, and screen
// readers announce one labelled field rather than N unlabelled boxes. The
// slots are aria-hidden mirrors of its value and caret.
export function CodeInput({
  id,
  name,
  length,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
  autoFocus,
}: {
  id: string;
  name: string;
  length: number;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);

  const syncCaret = () => {
    const input = inputRef.current;
    if (input) setCaret(input.selectionStart ?? input.value.length);
  };

  // A click lands on the invisible input at an arbitrary text offset; move the
  // caret to the slot that was actually clicked. Clicking a filled slot selects
  // its digit so the next keystroke replaces it.
  const handlePointerUp = (event: PointerEvent<HTMLInputElement>) => {
    const input = inputRef.current;
    const slots = slotsRef.current?.querySelectorAll("[data-slot]");
    if (!input || !slots) return;

    let index = slots.length - 1;
    for (let i = 0; i < slots.length; i++) {
      if (event.clientX <= slots[i].getBoundingClientRect().right) {
        index = i;
        break;
      }
    }

    if (index < input.value.length) {
      input.setSelectionRange(index, index + 1);
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
    syncCaret();
  };

  // Which slot mirrors the caret. Whether it's highlighted is left to CSS
  // (`group-has-[input:focus]`), so it also holds for an input that was
  // autofocused before hydration, when no React focus event fires.
  const activeIndex = Math.min(caret, length - 1);
  // Split long codes into two halves ("123 456") for readability.
  const splitAfter = length % 2 === 0 ? length / 2 - 1 : -1;

  return (
    <div className="group relative">
      <div
        ref={slotsRef}
        aria-hidden="true"
        className="flex items-center gap-1.5 sm:gap-2"
      >
        {Array.from({ length }, (_, index) => {
          const digit = value[index];
          const active = index === activeIndex;

          return (
            <div key={index} className="contents">
              <div
                data-slot
                className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-md border bg-surface font-mono text-xl font-medium tabular-nums transition-[border-color,box-shadow] duration-150 sm:h-13 ${
                  invalid
                    ? "border-danger"
                    : digit
                      ? "border-foreground/35"
                      : "border-input"
                } ${
                  active
                    ? invalid
                      ? "group-has-[input:focus]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_20%,transparent)]"
                      : "group-has-[input:focus]:border-ring group-has-[input:focus]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]"
                    : ""
                } ${disabled ? "bg-fill text-muted" : ""}`}
              >
                {digit ??
                  (active ? (
                    <span className="code-caret hidden group-has-[input:focus]:block" />
                  ) : null)}
              </div>
              {index === splitAfter && (
                <span className="h-px w-2 shrink-0 bg-input sm:w-2.5" />
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          onChange(event.target.value.replace(/\D/g, "").slice(0, length));
          requestAnimationFrame(syncCaret);
        }}
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onFocus={syncCaret}
        onPointerUp={handlePointerUp}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        // 16px text keeps iOS from zooming in on focus; the text itself is
        // never visible (the slots render it).
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent disabled:cursor-not-allowed"
      />
    </div>
  );
}
