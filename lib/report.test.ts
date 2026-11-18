import { describe, expect, it } from "vitest";
import { formatPercent } from "@/lib/format";
import { computeDayReport, type ReportBooking } from "@/lib/report";

const settings = { earlyCheckinMin: 10, checkinWindowMin: 15 };
const at = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00Z`);
const endOfDay = at("22:00");

const checkedIn = (roomId: string, start: string, end: string): ReportBooking => ({
  roomId,
  status: "checked_in",
  startAt: at(start),
  endAt: at(end),
  checkedInAt: at(start),
});

const released = (roomId: string, start: string, end: string): ReportBooking => ({
  roomId,
  status: "released",
  startAt: at(start),
  endAt: at(end),
  checkedInAt: null,
});

// Scenario 7: 10 bookings, 7 checked in, 3 released, 2 of the released slots re-booked.
const scenario7: ReportBooking[] = [
  released("A", "14:00", "16:00"),
  checkedIn("A", "14:30", "15:30"),
  released("B", "10:00", "11:00"),
  checkedIn("B", "10:30", "11:00"),
  released("C", "12:00", "13:00"),
  checkedIn("C", "09:00", "10:00"),
  checkedIn("D", "09:00", "10:00"),
  checkedIn("D", "11:00", "12:00"),
  checkedIn("E", "13:00", "14:00"),
  checkedIn("E", "15:00", "16:00"),
];

describe("computeDayReport", () => {
  it("scenario 7: 70% checked in, 30% no-show, re-booked hours", () => {
    const report = computeDayReport({ bookings: scenario7, conflictBlockedCount: 0, settings, now: endOfDay });
    const decided = report.checkedIn + report.released;
    expect(report.totalBookings).toBe(10);
    expect(formatPercent(report.checkedIn, decided)).toBe("70%");
    expect(formatPercent(report.released, decided)).toBe("30%");
    expect(report.rebookedCount).toBe(2);
    // A: 14:30-15:30 inside 14:15-16:00 = 60; B: 10:30-11:00 inside 10:15-11:00 = 30.
    expect(report.minutesRebooked).toBe(90);
    // 105 (A) + 45 (B) + 45 (C).
    expect(report.minutesReleased).toBe(195);
  });

  it("leaves cancelled bookings out of every count", () => {
    const cancelled: ReportBooking = { ...checkedIn("F", "09:00", "10:00"), status: "cancelled" };
    const report = computeDayReport({
      bookings: [...scenario7, cancelled],
      conflictBlockedCount: 0,
      settings,
      now: endOfDay,
    });
    expect(report.totalBookings).toBe(10);
    expect(report.checkedIn).toBe(7);
  });

  it("does not let a cancelled booking count as a re-booking", () => {
    const report = computeDayReport({
      bookings: [released("A", "14:00", "16:00"), { ...checkedIn("A", "14:30", "15:30"), status: "cancelled" }],
      conflictBlockedCount: 0,
      settings,
      now: endOfDay,
    });
    expect(report.rebookedCount).toBe(0);
    expect(report.minutesRebooked).toBe(0);
  });

  it("keeps pending bookings out of the rates", () => {
    const pending: ReportBooking = { ...released("F", "20:00", "21:00"), status: "booked" };
    const report = computeDayReport({
      bookings: [checkedIn("A", "09:00", "10:00"), pending],
      conflictBlockedCount: 0,
      settings,
      now: at("12:00"),
    });
    expect(report.pending).toBe(1);
    expect(report.totalBookings).toBe(2);
    expect(formatPercent(report.checkedIn, report.checkedIn + report.released)).toBe("100%");
  });

  it("counts a booking past its window as released before it is persisted", () => {
    const overdue: ReportBooking = { ...released("A", "09:00", "10:00"), status: "booked" };
    const report = computeDayReport({ bookings: [overdue], conflictBlockedCount: 0, settings, now: at("09:16") });
    expect(report.released).toBe(1);
    expect(report.pending).toBe(0);
  });

  it("passes the blocked-conflict count through", () => {
    const report = computeDayReport({ bookings: [], conflictBlockedCount: 3, settings, now: endOfDay });
    expect(report.conflictsBlocked).toBe(3);
  });

  it("returns zeros for an empty day", () => {
    const report = computeDayReport({ bookings: [], conflictBlockedCount: 0, settings, now: endOfDay });
    expect(report).toEqual({
      totalBookings: 0,
      checkedIn: 0,
      released: 0,
      pending: 0,
      minutesReleased: 0,
      minutesRebooked: 0,
      rebookedCount: 0,
      conflictsBlocked: 0,
    });
    expect(formatPercent(report.checkedIn, report.checkedIn + report.released)).toBe("0%");
  });
});
