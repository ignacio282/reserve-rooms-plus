import { checkInAvailability, checkInWindow, deriveStatus, type CheckInSettings, type RuleBooking } from "@/lib/booking-rules";
import { activeIntervals, roomStateAt, type Interval, type RoomState } from "@/lib/schedule";

/** Wrong room codes allowed per subject inside the window before check-in pauses. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MIN = 10;

const MINUTE_MS = 60_000;
const BOOKING_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export type Identifier = { kind: "card"; value: string } | { kind: "code"; value: string };

/** A booking code (6 characters) or the last 4 digits of a library card. */
export function parseIdentifier(input: string): Identifier | null {
  const value = input.trim().toUpperCase();
  if (/^\d{4}$/.test(value)) return { kind: "card", value };
  if (BOOKING_CODE_RE.test(value)) return { kind: "code", value };
  return null;
}

export type CheckInOutcome =
  | { kind: "open"; closesAt: Date }
  | { kind: "too_early"; opensAt: Date }
  | { kind: "released"; closesAt: Date }
  | { kind: "checked_in" }
  | { kind: "cancelled" }
  | { kind: "completed" };

/** What a patron trying to check in to this booking at `now` should see. */
export function bookingCheckInOutcome(booking: RuleBooking, settings: CheckInSettings, now: Date): CheckInOutcome {
  const status = deriveStatus(booking, settings, now);
  if (status === "cancelled") return { kind: "cancelled" };
  if (status === "completed") return { kind: "completed" };
  if (status === "checked_in") return { kind: "checked_in" };
  if (status === "released") return { kind: "released", closesAt: checkInWindow(booking, settings).closesAt };
  const availability = checkInAvailability(booking, settings, now);
  if (availability.state === "too_early") return { kind: "too_early", opensAt: availability.opensAt };
  if (availability.state === "open") return { kind: "open", closesAt: availability.closesAt };
  return { kind: "released", closesAt: checkInWindow(booking, settings).closesAt };
}

export interface MatchableBooking extends RuleBooking {
  bookingCode: string;
  cardLast4: string;
}

const RANK: Record<CheckInOutcome["kind"], number> = {
  open: 0,
  too_early: 1,
  checked_in: 2,
  released: 3,
  completed: 4,
  cancelled: 5,
};

/**
 * The booking a patron most likely means, among one room's bookings for the day:
 * window open, then the nearest upcoming, then checked in, then the most recently released.
 */
export function matchBooking<B extends MatchableBooking>(
  bookings: B[],
  identifier: Identifier,
  settings: CheckInSettings,
  now: Date,
): B | null {
  const ranked = bookings
    .filter((b) => (identifier.kind === "card" ? b.cardLast4 === identifier.value : b.bookingCode.toUpperCase() === identifier.value))
    .map((b) => ({ b, rank: RANK[bookingCheckInOutcome(b, settings, now).kind] }))
    .sort((x, y) => {
      if (x.rank !== y.rank) return x.rank - y.rank;
      const diff = x.b.startAt.getTime() - y.b.startAt.getTime();
      // Upcoming: nearest first. Released and later ranks: most recent first.
      return x.rank <= 1 ? diff : -diff;
    });
  return ranked[0]?.b ?? null;
}

export interface RoomCheckInView {
  state: RoomState;
  /** First moment from `now` the room is free, when it is busy now and frees up before closing. */
  nextFree: Date | null;
  /** The next booking whose check-in window has not opened yet. */
  upcoming: { startAt: Date; opensAt: Date } | null;
}

export function roomCheckInView(
  now: Date,
  bookings: RuleBooking[],
  settings: CheckInSettings,
  open: Interval | null,
): RoomCheckInView {
  const state = roomStateAt(now, bookings, settings, open);
  let nextFree: Date | null = null;
  if (open && (state.kind === "in_use" || state.kind === "awaiting_check_in")) {
    let cursor = now.getTime();
    // A booking awaiting check-in may start a few minutes from now; it still holds the room.
    let holdNext = state.kind === "awaiting_check_in";
    for (const i of activeIntervals(bookings, settings, now)) {
      if (i.end.getTime() <= cursor) continue;
      if (i.start.getTime() > cursor && !holdNext) break;
      cursor = i.end.getTime();
      holdNext = false;
    }
    nextFree = cursor < open.end.getTime() ? new Date(cursor) : null;
  }
  const next = bookings
    .filter((b) => deriveStatus(b, settings, now) === "booked" && b.startAt > now)
    .map((b) => ({ startAt: b.startAt, opensAt: checkInWindow(b, settings).opensAt }))
    .filter((b) => b.opensAt > now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  return { state, nextFree, upcoming: next ?? null };
}

/** Walk-ins start on the current minute. */
export function walkInStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
}

/** A walk-in runs until the room is next needed or closes, capped at the room type's max length. */
export function walkInEnd(now: Date, freeUntil: Date, maxMinutes: number): Date {
  const cap = walkInStart(now).getTime() + maxMinutes * MINUTE_MS;
  return new Date(Math.min(freeUntil.getTime(), cap));
}

export function isPaused(recentFailureCount: number): boolean {
  return recentFailureCount >= MAX_FAILURES;
}
