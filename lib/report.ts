import { checkInWindow, deriveStatus, type CheckInSettings, type RuleBooking } from "@/lib/booking-rules";

export interface ReportBooking extends RuleBooking {
  roomId: string;
}

export interface DayReport {
  totalBookings: number;
  checkedIn: number;
  released: number;
  pending: number;
  minutesReleased: number;
  minutesRebooked: number;
  rebookedCount: number;
  conflictsBlocked: number;
}

const MINUTE_MS = 60_000;

/**
 * Day report from the day's bookings. Check-in and no-show rates are
 * checkedIn and released over (checkedIn + released); pending bookings are not
 * decided yet, so they stay out of the rates.
 */
export function computeDayReport(input: {
  bookings: ReportBooking[];
  conflictBlockedCount: number;
  settings: CheckInSettings;
  now: Date;
}): DayReport {
  const { bookings, conflictBlockedCount, settings, now } = input;
  const withStatus = bookings.map((b) => ({ ...b, derived: deriveStatus(b, settings, now) }));
  const active = withStatus.filter((b) => b.derived !== "cancelled");
  const released = active.filter((b) => b.derived === "released");
  const occupying = active.filter((b) => b.derived !== "released");

  let minutesReleased = 0;
  let minutesRebooked = 0;
  let rebookedCount = 0;
  for (const r of released) {
    const freedFrom = checkInWindow(r, settings).closesAt.getTime();
    const freedTo = r.endAt.getTime();
    minutesReleased += Math.max(0, freedTo - freedFrom) / MINUTE_MS;

    let overlap = 0;
    for (const o of occupying) {
      if (o.roomId !== r.roomId) continue;
      overlap += Math.max(0, Math.min(freedTo, o.endAt.getTime()) - Math.max(freedFrom, o.startAt.getTime()));
    }
    if (overlap > 0) rebookedCount += 1;
    minutesRebooked += overlap / MINUTE_MS;
  }

  return {
    totalBookings: active.length,
    checkedIn: active.filter((b) => b.derived === "checked_in" || b.derived === "completed").length,
    released: released.length,
    pending: active.filter((b) => b.derived === "booked").length,
    minutesReleased,
    minutesRebooked,
    rebookedCount,
    conflictsBlocked: conflictBlockedCount,
  };
}
