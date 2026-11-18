"use client";

import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { createWebBooking, type WebBookingState } from "@/app/book/actions";
import type { AlternativeOption } from "@/lib/server/alternatives";

const FIELD_ORDER = ["patronName", "cardLast4", "partySize"] as const;
type FieldName = (typeof FIELD_ORDER)[number];

export interface ConfirmTarget {
  roomId: string;
  label: string;
  start: string;
  end: string;
}

export function ConfirmForm({
  date,
  dayText,
  initial,
  capacity,
}: {
  date: string;
  dayText: string;
  initial: ConfirmTarget;
  capacity: number;
}) {
  const [target, setTarget] = useState(initial);
  const [values, setValues] = useState<Record<FieldName, string>>({ patronName: "", cardLast4: "", partySize: "1" });
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<WebBookingState, FormData>(createWebBooking, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<WebBookingState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    const firstInvalid = FIELD_ORDER.find((f) => state.fieldErrors?.[f]);
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
  }, [state]);

  const errorFor = (name: FieldName) => (state && !cleared.has(name) ? state.fieldErrors?.[name] : undefined);
  const change = (name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setCleared((c) => new Set(c).add(name));
  };
  const pick = (alt: AlternativeOption) => {
    setTarget({ roomId: alt.roomId, label: alt.label, start: alt.start, end: alt.end });
    setCleared(new Set(["conflict"]));
  };

  const conflict = state?.conflict && !cleared.has("conflict") ? state.conflict : undefined;
  const generalError = state && !state.conflict && !state.fieldErrors ? state.error : undefined;

  const input = (name: FieldName, label: string, extra: InputHTMLAttributes<HTMLInputElement>) => {
    const err = errorFor(name);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`p-${name}`} className="font-medium">
          {label}
        </label>
        <input
          id={`p-${name}`}
          name={name}
          value={values[name]}
          onChange={(e) => change(name, e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `p-${name}-error` : undefined}
          className={`min-h-12 w-full rounded-lg border bg-surface px-4 text-base ${err ? "border-now" : "border-line-strong"}`}
          {...extra}
        />
        {err ? (
          <p id={`p-${name}-error`} className="text-sm font-medium text-now">
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form ref={formRef} action={formAction} onSubmit={() => setCleared(new Set())} noValidate className="flex flex-col gap-5">
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">{dayText}</p>
        <p className="text-lg font-semibold">{target.label}</p>
      </div>

      {conflict ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-booked-edge bg-booked-bg p-4 text-booked">
          <p className="font-semibold">{state?.error}</p>
          <p>{conflict.label}</p>
          {conflict.alternatives.length > 0 ? (
            <>
              <p>These times are free. Tap one to book it instead:</p>
              <ul className="flex flex-col gap-2">
                {conflict.alternatives.map((alt) => (
                  <li key={`${alt.roomId}-${alt.start}`}>
                    <button
                      type="button"
                      onClick={() => pick(alt)}
                      className="min-h-12 w-full rounded-lg border border-line-strong bg-surface px-4 text-left font-medium text-ink"
                    >
                      {alt.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No other times are free that day. Try another day.</p>
          )}
        </div>
      ) : null}

      {generalError ? (
        <p role="alert" className="rounded-xl border border-now bg-surface p-4 font-medium text-now">
          {generalError}
        </p>
      ) : null}

      <input type="hidden" name="roomId" value={target.roomId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="start" value={target.start} />
      <input type="hidden" name="end" value={target.end} />

      {input("patronName", "Your name", { type: "text", autoComplete: "name", maxLength: 80 })}
      {input("cardLast4", "Last 4 digits of your library card", {
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        maxLength: 4,
      })}
      {input("partySize", "How many people?", { type: "number", inputMode: "numeric", min: 1, max: capacity })}

      <button
        type="submit"
        disabled={pending}
        className="min-h-14 rounded-xl bg-accent px-5 text-lg font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Booking..." : "Book this room"}
      </button>
    </form>
  );
}
