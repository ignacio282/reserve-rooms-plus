"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckinField, ROOM_CODE_INPUT } from "@/app/_components/CheckinField";
import type { CheckInResult } from "@/app/_components/checkin-messages";
import { checkInFromBookingPage } from "@/app/book/actions";

/**
 * Room-code check-in on the booking page. The status region stays mounted when the
 * page refreshes into the checked-in state, so the result is announced.
 */
export function CheckInForm({ bookingId, checkedIn, checkedInText }: { bookingId: string; checkedIn: boolean; checkedInText: string }) {
  const [state, formAction, pending] = useActionState<CheckInResult, FormData>(checkInFromBookingPage, null);
  const [editedSince, setEditedSince] = useState<CheckInResult>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const handled = useRef<CheckInResult>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.success) return;
    if (state.kind === "wrong_code" && inputRef.current) inputRef.current.value = "";
    if (state.kind === "invalid" || state.kind === "wrong_code") inputRef.current?.focus();
    else statusRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (checkedIn && handled.current?.success) statusRef.current?.focus();
  }, [checkedIn]);

  const failure = state && !state.success ? state : null;
  const fieldError = failure && editedSince !== state && (failure.kind === "invalid" || failure.kind === "wrong_code") ? failure.error : undefined;
  const notice = failure && failure.kind !== "invalid" && failure.kind !== "wrong_code" ? failure.error : null;

  return (
    <div className="flex flex-col gap-4">
      <div ref={statusRef} tabIndex={-1} role="status" className="outline-offset-4 empty:hidden">
        {checkedIn ? (
          <p className="rounded-xl border border-checked-edge bg-checked-bg p-4 font-semibold text-checked">{checkedInText}</p>
        ) : notice ? (
          <p className="rounded-xl border border-now bg-surface p-4 font-medium text-now">{notice}</p>
        ) : null}
      </div>

      {checkedIn ? null : (
        <form action={formAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <CheckinField
            ref={inputRef}
            id="room-code"
            name="code"
            label="Room code"
            hint="The 6-digit code on the room's door display. It changes every minute."
            error={fieldError}
            onChange={() => setEditedSince(state)}
            {...ROOM_CODE_INPUT}
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-14 rounded-xl bg-accent px-5 text-lg font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Checking in..." : "Check in"}
          </button>
        </form>
      )}
    </div>
  );
}
