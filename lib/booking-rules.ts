import type { StoredBookingStatus } from "@/types/domain";

export interface CheckInSettings {
  earlyCheckinMin: number;
  checkinWindowMin: number;
}

export interface RuleBooking {
  status: StoredBookingStatus;
  startAt: Date;
  endAt: Date;
  checkedInAt: Date | null;
}

export type DerivedStatus = "cancelled" | "completed" | "checked_in" | "released" | "booked";

export type CheckInAvailability =
  | { state: "too_early"; opensAt: Date }
  | { state: "open"; closesAt: Date }
  | { state: "closed" };

const MINUTE_MS = 60_000;

export function checkInWindow(
  booking: Pick<RuleBooking, "startAt">,
  settings: CheckInSettings,
): { opensAt: Date; closesAt: Date } {
  const start = booking.startAt.getTime();
  return {
    opensAt: new Date(start - settings.earlyCheckinMin * MINUTE_MS),
    closesAt: new Date(start + settings.checkinWindowMin * MINUTE_MS),
  };
}

export function checkInAvailability(
  booking: Pick<RuleBooking, "startAt">,
  settings: CheckInSettings,
  now: Date,
): CheckInAvailability {
  const { opensAt, closesAt } = checkInWindow(booking, settings);
  if (now < opensAt) return { state: "too_early", opensAt };
  if (now <= closesAt) return { state: "open", closesAt };
  return { state: "closed" };
}

export function deriveStatus(booking: RuleBooking, settings: CheckInSettings, now: Date): DerivedStatus {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "released") return "released";
  if (booking.checkedInAt) return now >= booking.endAt ? "completed" : "checked_in";
  if (now > checkInWindow(booking, settings).closesAt) return "released";
  return "booked";
}
