import { checkInAvailability, deriveStatus, type CheckInSettings } from "@/lib/booking-rules";
import { formatTime, formatTimeRange } from "@/lib/format";
import type { BoardBooking } from "@/lib/server/board";
import type { TagStatus } from "@/app/_components/StatusTag";

const CHANNEL: Record<BoardBooking["channel"], string> = { desk: "Desk", web: "Web", walk_in: "Walk-in" };

/** What the client needs to show and act on one booking. Rules are decided here, on the server. */
export interface BookingSummary {
  id: string;
  patronName: string;
  cardLast4: string;
  partySize: number;
  channel: string;
  roomId: string;
  roomName: string;
  startISO: string;
  endISO: string;
  range: string;
  tag: TagStatus;
  detail?: string;
  canCheckIn: boolean;
  canCancel: boolean;
  canRelease: boolean;
  canMove: boolean;
  checkedIn: boolean;
}

export function summarize(
  b: BoardBooking,
  roomName: string,
  settings: CheckInSettings,
  now: Date,
  timeZone: string,
  isPast: boolean,
): BookingSummary {
  const derived = deriveStatus(b, settings, now);
  const avail = derived === "booked" ? checkInAvailability(b, settings, now) : null;
  const detail =
    avail?.state === "too_early"
      ? `Check-in opens ${formatTime(avail.opensAt, timeZone)}`
      : avail?.state === "open"
        ? `Check-in closes ${formatTime(avail.closesAt, timeZone)}`
        : undefined;
  return {
    id: b.id,
    patronName: b.patronName,
    cardLast4: b.cardLast4,
    partySize: b.partySize,
    channel: CHANNEL[b.channel],
    roomId: b.roomId,
    roomName,
    startISO: b.startAt.toISOString(),
    endISO: b.endAt.toISOString(),
    range: formatTimeRange(b.startAt, b.endAt, timeZone),
    tag: derived === "released" ? "cancelled" : derived,
    detail,
    canCheckIn: !isPast && avail?.state === "open",
    canRelease: !isPast && avail?.state === "open",
    canCancel: !isPast && derived === "booked",
    canMove: !isPast && (derived === "booked" || (derived === "checked_in" && now < b.endAt)),
    checkedIn: derived === "checked_in",
  };
}
