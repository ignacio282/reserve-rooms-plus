import type { InputHTMLAttributes, Ref } from "react";

/** A labeled mobile-friendly text field with its error linked for screen readers. */
export function CheckinField({
  id,
  label,
  hint,
  error,
  ...input
}: { id: string; label: string; hint?: string; error?: string; ref?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 w-full rounded-lg border bg-surface px-4 text-base ${error ? "border-now" : "border-line-strong"}`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-now">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Props for a 6-digit room code input (spaces and hyphens are accepted and ignored). */
export const ROOM_CODE_INPUT = {
  type: "text",
  inputMode: "numeric",
  autoComplete: "off",
  maxLength: 7,
  spellCheck: false,
} as const;
