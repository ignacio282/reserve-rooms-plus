"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createDeskBooking, type AlternativeOption, type BookingFormState } from "@/app/actions";
import { useBoard } from "@/app/_components/BoardProvider";
import { Icon } from "@/app/_components/Icon";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { formatDayLabel } from "@/lib/format";
import { endOptions, startOptions } from "@/lib/schedule";

export interface BookingRequest {
  roomId: string;
  start: string;
  end: string;
}

const FIELD_ORDER = ["start", "end", "patronName", "cardLast4", "partySize"];

function focusWhenRendered(id: string, attempts = 40) {
  const el = document.getElementById(id);
  if (el) el.focus();
  else if (attempts > 0) setTimeout(() => focusWhenRendered(id, attempts - 1), 100);
}

export function BookingDialog({ request, onClose }: { request: BookingRequest; onClose: (booked: boolean) => void }) {
  const { info, announce } = useBoard();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bookedRef = useRef(false);
  const handled = useRef<BookingFormState>(null);
  const [roomId, setRoomId] = useState(request.roomId);
  const [start, setStart] = useState(request.start);
  const [end, setEnd] = useState(request.end);
  const [patronName, setPatronName] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [conflictHidden, setConflictHidden] = useState(false);
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(createDeskBooking, null);

  const room = info.rooms.find((r) => r.id === roomId) ?? info.rooms[0];
  const open = useMemo(
    () => (info.openISO && info.closeISO ? { start: new Date(info.openISO), end: new Date(info.closeISO) } : null),
    [info.openISO, info.closeISO],
  );
  const starts = useMemo(
    () => (open ? startOptions(open, new Date(info.nowISO), info.timeZone) : []),
    [open, info.nowISO, info.timeZone],
  );
  const startValue = starts.some((o) => o.value === start) ? start : (starts[0]?.value ?? "");
  const startAt = starts.find((o) => o.value === startValue)?.at;
  const ends = useMemo(
    () => (open && startAt ? endOptions(open, startAt, MAX_MINUTES_BY_TYPE[room.type], info.timeZone) : []),
    [open, startAt, room.type, info.timeZone],
  );
  const endValue = ends.some((o) => o.value === end) ? end : (ends[0]?.value ?? "");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.success) {
      bookedRef.current = true;
      announce(state.message);
      dialogRef.current?.close();
      if (state.roomId !== info.selectedRoomId) {
        router.push(`/?date=${info.date}&view=room&room=${state.roomId}`);
      }
      focusWhenRendered(`booking-${state.bookingId}`);
      return;
    }
    const firstInvalid = FIELD_ORDER.find((f) => state.fieldErrors?.[f]);
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
  }, [state, announce, info.date, info.selectedRoomId, router]);

  const errorFor = (name: string) =>
    state && !state.success && !cleared.has(name) ? state.fieldErrors?.[name] : undefined;
  const clear = (name: string) => setCleared((prev) => new Set(prev).add(name));

  const pickAlternative = (alt: AlternativeOption) => {
    setRoomId(alt.roomId);
    setStart(alt.start);
    setEnd(alt.end);
    setConflictHidden(true);
    formRef.current?.querySelector<HTMLElement>("[name=patronName]")?.focus();
  };

  const conflict = state && !state.success && !conflictHidden ? state.conflict : undefined;
  const generalError = state && !state.success && !state.conflict && !state.fieldErrors ? state.error : undefined;

  const inputClass = (invalid: boolean) =>
    `w-full rounded-md border bg-surface px-3 py-2 text-sm ${invalid ? "border-now" : "border-line-strong"}`;

  const fieldProps = (name: string) => {
    const err = errorFor(name);
    return {
      id: `f-${name}`,
      name,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? `f-${name}-error` : undefined,
      className: inputClass(Boolean(err)),
    };
  };

  const fieldError = (name: string) => {
    const err = errorFor(name);
    return err ? (
      <p id={`f-${name}-error`} className="mt-1 text-xs font-medium text-now">
        {err}
      </p>
    ) : null;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="booking-title"
      onClose={() => onClose(bookedRef.current)}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop"
    >
      <form
        ref={formRef}
        action={formAction}
        onSubmit={() => {
          setCleared(new Set());
          setConflictHidden(false);
        }}
        noValidate className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="booking-title" className="text-lg font-semibold">
              Book {room.name}
            </h2>
            <p className="text-sm text-muted">
              {formatDayLabel(info.date)} · up to {room.capacity} people
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>

        <input type="hidden" name="roomId" value={room.id} />
        <input type="hidden" name="date" value={info.date} />

        {conflict ? (
          <div role="alert" className="rounded-lg border border-booked-edge bg-booked-bg p-3 text-sm text-booked">
            <p className="font-semibold">{conflict.label}</p>
            {conflict.alternatives.length > 0 ? (
              <>
                <p className="mt-1">These are free:</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {conflict.alternatives.map((alt) => (
                    <li key={`${alt.roomId}-${alt.start}`}>
                      <button
                        type="button"
                        onClick={() => pickAlternative(alt)}
                        className="min-h-9 w-full rounded-md border border-line-strong bg-surface px-3 py-1.5 text-left text-ink hover:border-accent"
                      >
                        {alt.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1">No other free time fits today. Try another day.</p>
            )}
          </div>
        ) : null}

        {generalError ? (
          <p role="alert" className="rounded-lg border border-now bg-surface-2 p-3 text-sm font-medium text-now">
            {generalError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-start" className="mb-1 block text-sm font-medium">
              Start
            </label>
            <select
              {...fieldProps("start")}
              value={startValue}
              onChange={(e) => {
                setStart(e.target.value);
                setConflictHidden(true);
                clear("start");
              }}
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
            <label htmlFor="f-end" className="mb-1 block text-sm font-medium">
              End
            </label>
            <select
              {...fieldProps("end")}
              value={endValue}
              onChange={(e) => {
                setEnd(e.target.value);
                setConflictHidden(true);
                clear("end");
              }}
            >
              {ends.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {fieldError("end")}
          </div>
        </div>

        <div>
          <label htmlFor="f-patronName" className="mb-1 block text-sm font-medium">
            Patron name
          </label>
          <input {...fieldProps("patronName")} type="text"
            autoComplete="off"
            maxLength={80}
            value={patronName}
            onChange={(e) => {
              setPatronName(e.target.value);
              clear("patronName");
            }}
          />
          {fieldError("patronName")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-cardLast4" className="mb-1 block text-sm font-medium">
              Library card, last 4
            </label>
            <input
              {...fieldProps("cardLast4")}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={cardLast4}
              onChange={(e) => {
                setCardLast4(e.target.value);
                clear("cardLast4");
              }}
            />
            {fieldError("cardLast4")}
          </div>
          <div>
            <label htmlFor="f-partySize" className="mb-1 block text-sm font-medium">
              Party size
            </label>
            <input
              {...fieldProps("partySize")}
              type="number"
              min={1}
              max={room.capacity}
              value={partySize}
              onChange={(e) => {
                setPartySize(e.target.value);
                clear("partySize");
              }}
            />
            {fieldError("partySize")}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="min-h-10 rounded-md px-4 text-sm font-medium text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Booking..." : "Book room"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
