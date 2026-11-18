"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { getMoveOptions, moveBooking, type AlternativeOption, type MoveFormState, type MoveOption } from "@/app/actions";
import { useBoard } from "@/app/_components/BoardProvider";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { Icon } from "@/app/_components/Icon";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { libraryTimeString } from "@/lib/clock";
import { formatTime } from "@/lib/format";
import { endOptions, startOptions, type TimeOption } from "@/lib/schedule";

const FIELD_ORDER = ["roomId", "start", "end"];

function withCurrent(options: TimeOption[], current: Date, timeZone: string): TimeOption[] {
  const value = libraryTimeString(current, timeZone);
  if (options.some((o) => o.value === value)) return options;
  return [{ value, label: `${formatTime(current, timeZone)} (current)`, at: current }, ...options].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
}

export function MoveDialog({ booking, onClose }: { booking: BookingSummary; onClose: () => void }) {
  const { info, announce } = useBoard();
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tz = info.timeZone;
  const originalStart = useMemo(() => new Date(booking.startISO), [booking.startISO]);
  const originalEnd = useMemo(() => new Date(booking.endISO), [booking.endISO]);
  const [roomId, setRoomId] = useState(booking.roomId);
  const [start, setStart] = useState(libraryTimeString(originalStart, tz));
  const [end, setEnd] = useState(libraryTimeString(originalEnd, tz));
  const [freeRooms, setFreeRooms] = useState<MoveOption[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [conflictHidden, setConflictHidden] = useState(false);
  const [state, formAction, pending] = useActionState<MoveFormState, FormData>(moveBooking, null);
  const handled = useRef<MoveFormState>(null);

  const room = info.rooms.find((r) => r.id === roomId) ?? info.rooms[0];
  const open = useMemo(
    () => (info.openISO && info.closeISO ? { start: new Date(info.openISO), end: new Date(info.closeISO) } : null),
    [info.openISO, info.closeISO],
  );
  const starts = useMemo(
    () => (open ? withCurrent(startOptions(open, new Date(info.nowISO), tz), originalStart, tz) : []),
    [open, info.nowISO, tz, originalStart],
  );
  const startAt = starts.find((o) => o.value === start)?.at ?? originalStart;
  const ends = useMemo(() => {
    if (!open) return [];
    const options = endOptions(open, startAt, MAX_MINUTES_BY_TYPE[room.type], tz);
    return startAt.getTime() === originalStart.getTime() ? withCurrent(options, originalEnd, tz) : options;
  }, [open, startAt, room.type, tz, originalStart, originalEnd]);
  const endValue = ends.some((o) => o.value === end) ? end : (ends[0]?.value ?? "");

  useEffect(() => {
    ref.current?.showModal();
    let cancelled = false;
    getMoveOptions(booking.id).then((result) => {
      if (cancelled) return;
      if (result.success) setFreeRooms(result.rooms);
      else {
        setFreeRooms([]);
        setOptionsError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.success) {
      announce(state.message);
      ref.current?.close();
      return;
    }
    const firstInvalid = FIELD_ORDER.find((f) => state.fieldErrors?.[f]);
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
  }, [state, announce]);

  const errorFor = (name: string) => (state && !state.success ? state.fieldErrors?.[name] : undefined);
  const conflict = state && !state.success && !conflictHidden ? state.conflict : undefined;
  const generalError = state && !state.success && !state.conflict && !state.fieldErrors ? state.error : undefined;

  const pick = (nextRoomId: string, nextStart?: string, nextEnd?: string) => {
    setRoomId(nextRoomId);
    if (nextStart) setStart(nextStart);
    if (nextEnd) setEnd(nextEnd);
    setConflictHidden(true);
  };

  const control = (name: string) => {
    const err = errorFor(name);
    return {
      id: `m-${name}`,
      name,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? `m-${name}-error` : undefined,
      className: `w-full rounded-md border bg-surface px-3 py-2 text-sm disabled:bg-surface-2 ${
        err ? "border-now" : "border-line-strong"
      }`,
    };
  };
  const fieldError = (name: string) =>
    errorFor(name) ? (
      <p id={`m-${name}-error`} className="mt-1 text-xs font-medium text-now">
        {errorFor(name)}
      </p>
    ) : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="move-title"
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop"
    >
      <form
        ref={formRef}
        action={formAction}
        onSubmit={() => setConflictHidden(false)}
        noValidate
        className="flex flex-col gap-4 p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="move-title" className="text-lg font-semibold">
              Move {booking.patronName}&apos;s booking
            </h2>
            <p className="text-sm text-muted">
              Now: {booking.roomName}, {booking.range} · party of {booking.partySize}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>

        <input type="hidden" name="bookingId" value={booking.id} />

        <section aria-labelledby="free-title" className="rounded-lg border border-line bg-surface-2 p-3">
          <h3 id="free-title" className="text-sm font-semibold">
            Free at this time
          </h3>
          {optionsError ? (
            <p role="alert" className="mt-1 text-sm font-medium text-now">
              {optionsError}
            </p>
          ) : freeRooms === null ? (
            <p className="mt-1 text-sm text-muted">Checking rooms...</p>
          ) : freeRooms.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No other room that fits this party is free at this time.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {freeRooms.map((r) => (
                <li key={r.roomId}>
                  <button
                    type="button"
                    aria-pressed={roomId === r.roomId}
                    onClick={() =>
                      pick(r.roomId, libraryTimeString(originalStart, tz), libraryTimeString(originalEnd, tz))
                    }
                    className={`min-h-9 rounded-md border px-3 text-sm font-medium ${
                      roomId === r.roomId ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface hover:border-accent"
                    }`}
                  >
                    {r.roomName} · up to {r.capacity}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {conflict ? (
          <div role="alert" className="rounded-lg border border-booked-edge bg-booked-bg p-3 text-sm text-booked">
            <p className="font-semibold">{conflict.label}</p>
            {conflict.alternatives.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {conflict.alternatives.map((alt: AlternativeOption) => (
                  <li key={`${alt.roomId}-${alt.start}`}>
                    <button
                      type="button"
                      onClick={() => pick(alt.roomId, alt.start, alt.end)}
                      className="min-h-9 w-full rounded-md border border-line-strong bg-surface px-3 py-1.5 text-left text-ink hover:border-accent"
                    >
                      {alt.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">No other free time fits this day.</p>
            )}
          </div>
        ) : null}

        {generalError ? (
          <p role="alert" className="rounded-lg border border-now bg-surface-2 p-3 text-sm font-medium text-now">
            {generalError}
          </p>
        ) : null}

        <div>
          <label htmlFor="m-roomId" className="mb-1 block text-sm font-medium">
            Room
          </label>
          <select {...control("roomId")} value={roomId} onChange={(e) => pick(e.target.value)}>
            {info.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (up to {r.capacity})
              </option>
            ))}
          </select>
          {fieldError("roomId")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {booking.checkedIn ? (
            <>
              <input type="hidden" name="start" value={libraryTimeString(originalStart, tz)} />
              <input type="hidden" name="end" value={libraryTimeString(originalEnd, tz)} />
              <p className="col-span-2 text-sm text-muted">
                Checked in, so the time stays {booking.range}. Only the room can change.
              </p>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="m-start" className="mb-1 block text-sm font-medium">
                  Start
                </label>
                <select
                  {...control("start")}
                  value={starts.some((o) => o.value === start) ? start : (starts[0]?.value ?? "")}
                  onChange={(e) => pick(roomId, e.target.value)}
                >
                  {starts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {fieldError("start")}
              </div>
              <div>
                <label htmlFor="m-end" className="mb-1 block text-sm font-medium">
                  End
                </label>
                <select {...control("end")} value={endValue} onChange={(e) => pick(roomId, undefined, e.target.value)}>
                  {ends.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {fieldError("end")}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-10 rounded-md px-4 text-sm font-medium text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Moving..." : "Move booking"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
