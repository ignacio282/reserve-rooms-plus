import { checkInWindow, deriveStatus, type CheckInSettings, type RuleBooking } from "@/lib/booking-rules";
import { libraryTimeString, zonedTimeToUtc } from "@/lib/clock";
import { formatTime } from "@/lib/format";
import type { OpeningHours, RoomType } from "@/types/domain";

export interface Interval {
  start: Date;
  end: Date;
}

export const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60_000;
/**
 * 1-based CSS grid lines for [start, end) on a grid of `rowMs`-long rows that begins at `origin`.
 * Start and end round the same way, so items sharing a boundary never share a row.
 */
export function gridRows(origin: Date, start: Date, end: Date, rowMs: number): { from: number; to: number } {
  const line = (t: Date) => Math.round((t.getTime() - origin.getTime()) / rowMs) + 1;
  const from = Math.max(1, line(start));
  return { from, to: Math.max(from + 1, line(end)) };
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Opening hours of a `YYYY-MM-DD` day as UTC instants, or null when closed. */
export function openingHoursFor(date: string, hours: OpeningHours, timeZone: string): Interval | null {
  const [y, m, d] = date.split("-").map(Number);
  const day = hours[WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]];
  if (!day) return null;
  return { start: zonedTimeToUtc(date, day.open, timeZone), end: zonedTimeToUtc(date, day.close, timeZone) };
}

/** Time held by bookings; released and cancelled bookings free their time. */
export function activeIntervals(bookings: RuleBooking[], settings: CheckInSettings, now: Date): Interval[] {
  return bookings
    .filter((b) => {
      const s = deriveStatus(b, settings, now);
      return s === "booked" || s === "checked_in" || s === "completed";
    })
    .map((b) => ({ start: b.startAt, end: b.endAt }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Open intervals inside opening hours, starting no earlier than `now`; slivers under 30 minutes are dropped. */
export function freeSlots(open: Interval, busy: Interval[], now: Date): Interval[] {
  const slots: Interval[] = [];
  let cursor = Math.max(open.start.getTime(), now.getTime());
  const push = (end: number) => {
    if (end - cursor >= SLOT_MS) slots.push({ start: new Date(cursor), end: new Date(end) });
  };
  for (const b of busy) {
    if (b.end.getTime() <= cursor) continue;
    if (b.start.getTime() >= open.end.getTime()) break;
    push(Math.min(b.start.getTime(), open.end.getTime()));
    cursor = Math.max(cursor, b.end.getTime());
  }
  push(open.end.getTime());
  return slots;
}

export type RoomState =
  | { kind: "closed" }
  | { kind: "in_use"; until: Date }
  | { kind: "awaiting_check_in"; closesAt: Date }
  | { kind: "free"; until: Date };

export function roomStateAt(
  now: Date,
  bookings: RuleBooking[],
  settings: CheckInSettings,
  open: Interval | null,
): RoomState {
  if (!open || now < open.start || now >= open.end) return { kind: "closed" };
  for (const b of bookings) {
    const status = deriveStatus(b, settings, now);
    if (status === "checked_in" && now >= b.startAt && now < b.endAt) return { kind: "in_use", until: b.endAt };
    if (status === "booked") {
      const { opensAt, closesAt } = checkInWindow(b, settings);
      if (now >= opensAt && now <= closesAt) return { kind: "awaiting_check_in", closesAt };
    }
  }
  const next = activeIntervals(bookings, settings, now).find((i) => i.start > now);
  return { kind: "free", until: next && next.start < open.end ? next.start : open.end };
}

export interface RoomSummary {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
}

export function availableNow<R extends RoomSummary>(
  rooms: R[],
  states: Map<string, RoomState>,
): { room: R; freeUntil: Date }[] {
  return rooms
    .flatMap((room) => {
      const s = states.get(room.id);
      return s?.kind === "free" ? [{ room, freeUntil: s.until }] : [];
    })
    .sort((a, b) => b.freeUntil.getTime() - a.freeUntil.getTime());
}

export interface Alternative {
  roomId: string;
  roomName: string;
  start: Date;
  end: Date;
}

function isFree(busy: Interval[], start: Date, end: Date): boolean {
  return busy.every((b) => b.end <= start || b.start >= end);
}

/** Up to 3 later slots of the same length in the same room, and up to 3 other rooms free for the same time. */
export function findAlternatives(input: {
  roomId: string;
  start: Date;
  end: Date;
  partySize: number;
  rooms: RoomSummary[];
  busyByRoom: Map<string, Interval[]>;
  open: Interval;
}): { sameRoom: Alternative[]; otherRooms: Alternative[] } {
  const { roomId, start, end, partySize, rooms, busyByRoom, open } = input;
  const length = end.getTime() - start.getTime();
  const room = rooms.find((r) => r.id === roomId);
  const sameRoom: Alternative[] = [];
  const busy = busyByRoom.get(roomId) ?? [];
  for (let t = start.getTime() + SLOT_MS; t + length <= open.end.getTime() && sameRoom.length < 3; t += SLOT_MS) {
    const s = new Date(t);
    const e = new Date(t + length);
    if (room && isFree(busy, s, e)) sameRoom.push({ roomId, roomName: room.name, start: s, end: e });
  }
  const otherRooms = rooms
    .filter((r) => r.id !== roomId && r.capacity >= partySize && isFree(busyByRoom.get(r.id) ?? [], start, end))
    .slice(0, 3)
    .map((r) => ({ roomId: r.id, roomName: r.name, start, end }));
  return { sameRoom, otherRooms };
}

export interface TimeOption {
  value: string;
  label: string;
  at: Date;
}

/**
 * Start choices for a day: 30-minute boundaries inside opening hours that have
 * not passed, led by "Now" when the current minute is inside opening hours and
 * not on a boundary.
 */
export function startOptions(open: Interval, now: Date, timeZone: string): TimeOption[] {
  const options: TimeOption[] = [];
  const nowMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  if (nowMinute > open.start.getTime() && nowMinute < open.end.getTime() - 60_000 && nowMinute % SLOT_MS !== 0) {
    options.push({ value: "now", label: `Now (${formatTime(new Date(nowMinute), timeZone)})`, at: new Date(nowMinute) });
  }
  for (let t = open.start.getTime(); t + SLOT_MS <= open.end.getTime(); t += SLOT_MS) {
    if (t < nowMinute) continue;
    const at = new Date(t);
    options.push({ value: libraryTimeString(at, timeZone), label: formatTime(at, timeZone), at });
  }
  return options;
}

/** End choices: 30-minute boundaries after `start`, up to closing and the room's maximum length. */
export function endOptions(open: Interval, start: Date, maxMinutes: number, timeZone: string): TimeOption[] {
  const options: TimeOption[] = [];
  const first = Math.floor(start.getTime() / SLOT_MS) * SLOT_MS + SLOT_MS;
  const last = Math.min(open.end.getTime(), start.getTime() + maxMinutes * 60_000);
  for (let t = first; t <= last; t += SLOT_MS) {
    const at = new Date(t);
    options.push({ value: libraryTimeString(at, timeZone), label: formatTime(at, timeZone), at });
  }
  return options;
}

/** Staff search: digits match the start of the card's last 4, anything else matches the patron name. */
export function matchesBookingQuery(booking: { patronName: string; cardLast4: string }, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/^\d+$/.test(q)) return booking.cardLast4.startsWith(q);
  return booking.patronName.toLowerCase().includes(q.toLowerCase());
}

/** `today` plus the following days, as `YYYY-MM-DD`. */
export function bookingDays(today: string, count: number): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

export interface StartSlot extends TimeOption {
  state: "available" | "taken" | "past";
}

/** Every 30-minute start in opening hours; a start is available only if 30 free minutes follow it. */
export function startSlots(open: Interval, busy: Interval[], now: Date, timeZone: string): StartSlot[] {
  const slots: StartSlot[] = [];
  for (let t = open.start.getTime(); t + SLOT_MS <= open.end.getTime(); t += SLOT_MS) {
    const at = new Date(t);
    const state = t < now.getTime() ? "past" : isFree(busy, at, new Date(t + SLOT_MS)) ? "available" : "taken";
    slots.push({ value: libraryTimeString(at, timeZone), label: formatTime(at, timeZone), at, state });
  }
  return slots;
}

/** Lengths in 30-minute steps that fit before the next booking, closing and the room maximum. */
export function lengthOptions(start: Date, busy: Interval[], close: Date, maxMinutes: number): number[] {
  const nextBusy = busy.filter((b) => b.start >= start).reduce((min, b) => Math.min(min, b.start.getTime()), Infinity);
  const limit = Math.min(close.getTime(), nextBusy, start.getTime() + maxMinutes * 60_000);
  const lengths: number[] = [];
  for (let m = SLOT_MINUTES; start.getTime() + m * 60_000 <= limit; m += SLOT_MINUTES) lengths.push(m);
  return lengths;
}

/** "30 min", "1 hour", "1 hour 30 min", "2 hours". */
export function formatLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? "" : h === 1 ? "1 hour" : `${h} hours`;
  return [hours, m ? `${m} min` : ""].filter(Boolean).join(" ");
}
