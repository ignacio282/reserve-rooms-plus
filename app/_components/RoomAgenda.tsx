import { BookingActions } from "@/app/_components/BookingActions";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { CheckinCodeButton } from "@/app/_components/CheckinCodeButton";
import { OpenSlotButton } from "@/app/_components/OpenSlotButton";
import { CARD_EDGE, StatusTag } from "@/app/_components/StatusTag";
import { checkInAvailability, deriveStatus, type CheckInSettings } from "@/lib/booking-rules";
import { libraryTimeString } from "@/lib/clock";
import { formatTime, formatTimeRange } from "@/lib/format";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { SLOT_MINUTES, type Interval } from "@/lib/schedule";
import type { BoardBooking } from "@/lib/server/board";
import type { RoomRow } from "@/types/domain";
import type { CSSProperties } from "react";

const HOUR_MS = 3_600_000;
const SLOT_MS = SLOT_MINUTES * 60_000;
const CHANNEL: Record<BoardBooking["channel"], string> = { desk: "Desk", web: "Web", walk_in: "Walk-in" };
const TYPE_LABEL: Record<RoomRow["type"], string> = { study: "Study room", meeting: "Meeting room", community: "Community room" };

function position(open: Interval, start: Date, end: Date): CSSProperties {
  return {
    "--top": (start.getTime() - open.start.getTime()) / HOUR_MS,
    "--len": (end.getTime() - start.getTime()) / HOUR_MS,
  } as CSSProperties;
}

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
        <div className="relative ml-16 h-[calc(var(--len)*var(--hour))]" style={position(open, open.start, open.end)}>
          {hours.map((h) => (
            <div
              key={h.getTime()}
              className="absolute inset-x-0 top-[calc(var(--top)*var(--hour))] border-t border-line"
              style={position(open, h, h)}
              aria-hidden="true"
            >
              <span className="absolute -top-2.5 -left-16 w-14 text-right text-xs text-faint">{formatTime(h, timeZone)}</span>
            </div>
          ))}

          {showNow ? (
            <div
              className="absolute inset-x-0 top-0 h-[calc(var(--len)*var(--hour))] bg-surface-2/70"
              style={position(open, open.start, now)}
              aria-hidden="true"
            />
          ) : null}

          {!isPast
            ? freeSlots.map((slot) => {
                const req = slotRequest(slot, MAX_MINUTES_BY_TYPE[room.type], timeZone);
                const range = formatTimeRange(slot.start, slot.end, timeZone);
                return (
                  <div
                    key={slot.start.getTime()}
                    className="absolute inset-x-2 top-[calc(var(--top)*var(--hour)+3px)] flex h-[calc(var(--len)*var(--hour)-6px)] min-h-9"
                    style={position(open, slot.start, slot.end)}
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
            const tag = b.derived as "booked" | "checked_in" | "completed";
            return (
              <article
                key={b.id}
                id={`booking-${b.id}`}
                tabIndex={-1}
                aria-label={`${b.patronName}, ${range}`}
                className={`absolute inset-x-2 top-[calc(var(--top)*var(--hour)+3px)] flex h-[calc(var(--len)*var(--hour)-6px)] min-h-9 flex-col gap-1 overflow-hidden rounded-lg border border-l-4 border-line px-3 py-2 ${CARD_EDGE[tag]}`}
                style={position(open, b.startAt, b.endAt)}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold">{range}</span>
                  <span className="text-sm">{b.patronName}</span>
                  <span className="text-xs text-muted">
                    Party of {b.partySize} · {CHANNEL[b.channel]}
                  </span>
                  <StatusTag status={tag} detail={detail} />
                </div>
                {summaries.get(b.id) ? <BookingActions booking={summaries.get(b.id)!} /> : null}
              </article>
            );
          })}

          {showNow ? (
            <div
              className="absolute inset-x-0 top-[calc(var(--top)*var(--hour))] z-10 border-t-2 border-now"
              style={position(open, now, now)}
              aria-hidden="true"
            >
              <span className="absolute -top-2.5 -left-16 w-14 rounded bg-now px-1 text-right text-xs font-semibold text-white">
                {formatTime(now, timeZone)}
              </span>
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
