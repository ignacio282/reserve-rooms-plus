import { libraryDateString, zonedTimeToUtc } from "@/lib/clock";
import { formatTime } from "@/lib/format";
import { openingHoursFor, SLOT_MINUTES } from "@/lib/schedule";
import type { OpeningHours, RoomType } from "@/types/domain";

export const MAX_MINUTES_BY_TYPE: Record<RoomType, number> = { study: 120, meeting: 240, community: 240 };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

export interface DeskBookingFields {
  date: string;
  start: string;
  end: string;
  patronName: string;
  cardLast4: string;
  partySize: string;
}

export interface DeskBookingContext {
  room: { type: RoomType; capacity: number };
  openingHours: OpeningHours;
  timeZone: string;
  now: Date;
}

export type DeskBookingResult =
  | { ok: true; value: { start: Date; end: Date; patronName: string; cardLast4: string; partySize: number } }
  | { ok: false; fieldErrors: Record<string, string> };

function onBoundary(time: string): boolean {
  return Number(time.slice(3)) % SLOT_MINUTES === 0;
}

export function validateDeskBooking(fields: DeskBookingFields, ctx: DeskBookingContext): DeskBookingResult {
  const errors: Record<string, string> = {};
  const { timeZone, now } = ctx;

  const patronName = fields.patronName.trim();
  if (!patronName) errors.patronName = "Enter the patron's name.";
  else if (patronName.length > 80) errors.patronName = "Name must be 80 characters or fewer.";

  const cardLast4 = fields.cardLast4.trim();
  if (!/^\d{4}$/.test(cardLast4)) errors.cardLast4 = "Enter the last 4 digits of the library card.";

  const partySize = Number(fields.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > ctx.room.capacity) {
    errors.partySize = `Party size must be between 1 and ${ctx.room.capacity}.`;
  }

  const open = isValidDate(fields.date) ? openingHoursFor(fields.date, ctx.openingHours, timeZone) : null;
  if (!open) {
    errors.start = "Choose a valid day.";
    return { ok: false, fieldErrors: errors };
  }
  if (fields.date < libraryDateString(now, timeZone)) {
    errors.start = "This day has passed.";
    return { ok: false, fieldErrors: errors };
  }

  let start: Date | null = null;
  if (fields.start === "now") {
    const nowMinute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    if (fields.date !== libraryDateString(now, timeZone) || nowMinute < open.start || nowMinute >= open.end) {
      errors.start = "Choose a start time.";
    } else start = nowMinute;
  } else if (!isValidTime(fields.start)) {
    errors.start = "Choose a start time.";
  } else if (!onBoundary(fields.start)) {
    errors.start = "Choose a time on the hour or half hour.";
  } else {
    start = zonedTimeToUtc(fields.date, fields.start, timeZone);
    if (start < open.start) errors.start = `The library opens at ${formatTime(open.start, timeZone)}.`;
    else if (start < now) errors.start = "That time has already passed.";
  }

  let end: Date | null = null;
  if (!isValidTime(fields.end) || !onBoundary(fields.end)) {
    errors.end = "Choose an end time.";
  } else {
    end = zonedTimeToUtc(fields.date, fields.end, timeZone);
    const max = MAX_MINUTES_BY_TYPE[ctx.room.type];
    if (end > open.end) errors.end = `The library closes at ${formatTime(open.end, timeZone)}.`;
    else if (start && end <= start) errors.end = "End must be after the start.";
    else if (start && end.getTime() - start.getTime() > max * 60_000) {
      errors.end = `Bookings can be at most ${max / 60} hours for this room.`;
    }
  }

  if (Object.keys(errors).length > 0 || !start || !end) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { start, end, patronName, cardLast4, partySize } };
}

export interface MoveFields {
  start: string;
  end: string;
}

export interface MoveContext {
  booking: { status: "booked" | "checked_in"; startAt: Date; endAt: Date; partySize: number };
  room: { type: RoomType; capacity: number };
  openingHours: OpeningHours;
  timeZone: string;
  now: Date;
}

export type MoveResult = { ok: true; value: { start: Date; end: Date } } | { ok: false; fieldErrors: Record<string, string> };

/** Checks a staff move. The booking's own start and end are always allowed, even if past or off the grid. */
export function validateMove(fields: MoveFields, ctx: MoveContext): MoveResult {
  const errors: Record<string, string> = {};
  const { booking, room, timeZone, now } = ctx;
  const date = libraryDateString(booking.startAt, timeZone);
  const open = openingHoursFor(date, ctx.openingHours, timeZone);

  if (room.capacity < booking.partySize) {
    errors.roomId = `This room fits up to ${room.capacity} people; the party is ${booking.partySize}.`;
  }

  const toInstant = (time: string) => (isValidTime(time) ? zonedTimeToUtc(date, time, timeZone) : null);
  const start = toInstant(fields.start);
  const end = toInstant(fields.end);
  const startUnchanged = start?.getTime() === booking.startAt.getTime();
  const endUnchanged = end?.getTime() === booking.endAt.getTime();

  if (booking.status === "checked_in" && (!startUnchanged || !endUnchanged)) {
    errors.start = "A checked-in booking can only change room.";
    return { ok: false, fieldErrors: errors };
  }

  if (!start) errors.start = "Choose a start time.";
  else if (!startUnchanged) {
    if (!onBoundary(fields.start)) errors.start = "Choose a time on the hour or half hour.";
    else if (open && start < open.start) errors.start = `The library opens at ${formatTime(open.start, timeZone)}.`;
    else if (start < now) errors.start = "That time has already passed.";
  }

  if (!end) errors.end = "Choose an end time.";
  else if (!endUnchanged && !onBoundary(fields.end)) errors.end = "Choose a time on the hour or half hour.";
  else if (open && end > open.end) errors.end = `The library closes at ${formatTime(open.end, timeZone)}.`;
  else if (start && end <= start) errors.end = "End must be after the start.";
  else if (start && end.getTime() - start.getTime() > MAX_MINUTES_BY_TYPE[room.type] * 60_000) {
    errors.end = `Bookings can be at most ${MAX_MINUTES_BY_TYPE[room.type] / 60} hours for this room.`;
  }

  if (Object.keys(errors).length > 0 || !start || !end) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { start, end } };
}
