import { BookingActions } from "@/app/_components/BookingActions";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { CheckinCodeButton } from "@/app/_components/CheckinCodeButton";
import { OpenSlotButton } from "@/app/_components/OpenSlotButton";
import { Icon } from "@/app/_components/Icon";
import { STATUS_BLOCK, StatusTag, type BlockStatus } from "@/app/_components/StatusTag";
import { checkInAvailability, deriveStatus, type CheckInSettings } from "@/lib/booking-rules";
import { libraryTimeString } from "@/lib/clock";
import { formatTime, formatTimeRange } from "@/lib/format";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { gridRows, SLOT_MINUTES, type Interval } from "@/lib/schedule";
import type { BoardBooking } from "@/lib/server/board";
import type { RoomRow } from "@/types/domain";
import type { CSSProperties } from "react";

const HOUR_MS = 3_600_000;
const SLOT_MS = SLOT_MINUTES * 60_000;
const ROW_MINUTES = 5;
const ROW_MS = ROW_MINUTES * 60_000;
const ROWS_PER_HOUR = 60 / ROW_MINUTES;
const CHANNEL: Record<BoardBooking["channel"], string> = { desk: "Desk", web: "Web", walk_in: "Walk-in" };
const TYPE_LABEL: Record<RoomRow["type"], string> = { study: "Study room", meeting: "Meeting room", community: "Community room" };

/** Default request for an open slot: from its start (or "now") for up to an hour. */
function slotRequest(slot: Interval, maxMinutes: number, timeZone: string) {
  const onBoundary = slot.start.getTime() % SLOT_MS === 0;
  const firstBoundary = Math.ceil(slot.start.getTime() / SLOT_MS) * SLOT_MS;
  let end = Math.min(slot.end.getTime(), firstBoundary + Math.min(60, maxMinutes) * 60_000);
  if (end <= slot.start.getTime()) end = firstBoundary + SLOT_MS;
  return {
    start: onBoundary ? libraryTimeString(slot.start, timeZone) : "now",
    end: libraryTimeString(new Date(end), timeZone),
  };
}

export function RoomAgenda({
  room,
  open,
  bookings,
  freeSlots,
  settings,
  now,
  timeZone,
  isToday,
  isPast,
  summaries,
}: {
  room: RoomRow;
  open: Interval | null;
  bookings: BoardBooking[];
  freeSlots: Interval[];
  settings: CheckInSettings;
  now: Date;
  timeZone: string;
  isToday: boolean;
  isPast: boolean;
  summaries: Map<string, BookingSummary>;
}) {
  const withStatus = bookings.map((b) => ({ ...b, derived: deriveStatus(b, settings, now) }));
  const shown = withStatus.filter((b) => b.derived === "booked" || b.derived === "checked_in" || b.derived === "completed");
  const cancelled = withStatus.filter((b) => b.derived === "cancelled");
  const hours: Date[] = [];
  if (open) for (let t = open.start.getTime(); t <= open.end.getTime(); t += HOUR_MS) hours.push(new Date(t));
  const showNow = isToday && open && now >= open.start && now < open.end;
  const rows = (start: Date, end: Date) => gridRows(open!.start, start, end, ROW_MS);
  const rowStyle = (start: Date, end: Date): CSSProperties => {
    const { from, to } = rows(start, end);
    return { gridRow: `${from} / ${to}` };
  };
  const totalRows = open ? rows(open.start, open.end).to - 1 : 0;
  const sinceOpen = open ? (now.getTime() - open.start.getTime()) / ROW_MS : 0;
  const nowRow = Math.floor(sinceOpen);
  const nowFraction = sinceOpen - nowRow;

  return (
    <section aria-labelledby="agenda-title" className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex flex-col gap-2">
          <h2 id="agenda-title" className="text-2xl font-semibold">
            {room.name}
          </h2>
          <p className="text-base">
            {TYPE_LABEL[room.type]} · Maximum capacity: {room.capacity}
          </p>
          <p className="text-sm text-muted">{room.location_in_building}</p>
          {room.amenities.length ? (
            <ul aria-label="Amenities" className="mt-1 flex flex-wrap gap-1.5">
              {room.amenities.map((a) => (
                <li key={a} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                  {a}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <CheckinCodeButton roomId={room.id} roomName={room.name} />
      </div>

      {isPast ? <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">This day has passed.</p> : null}
      {!open ? <p className="text-sm text-muted">The library is closed this day.</p> : null}
      {open && shown.length === 0 ? <p className="text-sm text-muted">No bookings yet.</p> : null}

      {open ? (
        // One grid row per 5 minutes. Rows have a minimum height but grow when a card needs more room,
        // so hour lines, open slots and the time line move down with the cards instead of being covered.
        <div
          className="grid grid-cols-[2.75rem_minmax(0,1fr)] sm:grid-cols-[4rem_minmax(0,1fr)]"
          style={{ gridTemplateRows: `repeat(${totalRows}, minmax(calc(var(--hour) / ${ROWS_PER_HOUR}), auto)) 0px` }}
        >
          {showNow && nowRow > 0 ? (
            <div className="col-start-2 bg-surface-2/70" style={{ gridRow: `1 / ${nowRow + 1}` }} aria-hidden="true" />
          ) : null}

          {hours.map((h) => {
            const row = rows(h, h).from;
            return [
              <div key={`${h.getTime()}-label`} className="relative col-start-1 h-0 self-start" style={{ gridRow: row }} aria-hidden="true">
                <span className="absolute right-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-faint sm:text-xs">
                  <span className="sm:hidden">{formatTime(h, timeZone).replace(":00", "")}</span>
                  <span className="hidden sm:inline">{formatTime(h, timeZone)}</span>
                </span>
              </div>,
              <div
                key={`${h.getTime()}-line`}
                className="col-start-2 h-0 self-start border-t border-line"
                style={{ gridRow: row }}
                aria-hidden="true"
              />,
            ];
          })}

          {!isPast
            ? freeSlots.map((slot) => {
                const req = slotRequest(slot, MAX_MINUTES_BY_TYPE[room.type], timeZone);
                const range = formatTimeRange(slot.start, slot.end, timeZone);
                return (
                  <div
                    key={slot.start.getTime()}
                    className="col-start-2 mx-1 my-0.75 flex min-h-9 sm:mx-2"
                    style={rowStyle(slot.start, slot.end)}
                  >
                    <OpenSlotButton
                      roomId={room.id}
                      start={req.start}
                      end={req.end}
                      label={`Open ${range} · Book`}
                      accessibleLabel={`Book ${room.name}, open ${range}`}
                      className="w-full"
                    />
                  </div>
                );
              })
            : null}

          {shown.map((b) => {
            const range = formatTimeRange(b.startAt, b.endAt, timeZone);
            const avail = b.derived === "booked" ? checkInAvailability(b, settings, now) : null;
            const detail =
              avail?.state === "too_early"
                ? `Check-in opens ${formatTime(avail.opensAt, timeZone)}`
                : avail?.state === "open"
                  ? `Check-in closes ${formatTime(avail.closesAt, timeZone)}`
                  : undefined;
            const tag = b.derived as BlockStatus;
            const look = STATUS_BLOCK[tag];
            const summary = summaries.get(b.id);
            return (
              <article
                key={b.id}
                id={`booking-${b.id}`}
                data-live-key={b.id}
                data-live-version={`${tag}|${b.startAt.toISOString()}|${b.endAt.toISOString()}`}
                tabIndex={-1}
                aria-label={`${b.patronName}, ${range}`}
                className={`relative z-5 col-start-2 mx-1 my-0.75 flex flex-wrap content-center items-center gap-x-4 gap-y-1.5 rounded-md border px-3 py-2 sm:mx-2 ${look.box}`}
                style={rowStyle(b.startAt, b.endAt)}
              >
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{b.patronName}</span>
                  <span className="text-sm">{range}</span>
                  <span className="text-xs text-muted">
                    Party of {b.partySize} · {CHANNEL[b.channel]}
                  </span>
                </div>
                <p className={`flex items-center gap-1 text-xs font-medium ${look.text}`}>
                  <Icon name={look.icon} className="size-3.5 shrink-0" />
                  <span>
                    {look.label}
                    {detail ? <span className="font-normal"> · {detail}</span> : null}
                  </span>
                </p>
                {summary ? (
                  <div className="ml-auto">
                    <BookingActions booking={summary} layout="menu" />
                  </div>
                ) : null}
              </article>
            );
          })}

          {showNow ? (
            // Spans the row that contains "now" and sits at its fraction of that (possibly grown) row.
            // Explicit columns: an auto-placed item would be pushed beside the card sharing this row.
            <div className="pointer-events-none relative z-10 col-[1/-1]" style={{ gridRow: nowRow + 1 }} aria-hidden="true">
              <div className="absolute inset-x-0 h-0" style={{ top: `${nowFraction * 100}%` }}>
                <div className="absolute right-0 left-11 border-t-2 border-now sm:left-16" />
                <span className="absolute right-[calc(100%-2.75rem)] -translate-y-1/2 rounded bg-now px-1 text-[11px] font-semibold whitespace-nowrap text-white sm:right-[calc(100%-4rem)] sm:text-xs">
                  {formatTime(now, timeZone)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {cancelled.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Cancelled ({cancelled.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {cancelled.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>{formatTimeRange(b.startAt, b.endAt, timeZone)}</span>
                <span>{b.patronName}</span>
                <StatusTag status="cancelled" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
