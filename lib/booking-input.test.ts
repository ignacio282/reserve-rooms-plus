import { describe, expect, it } from "vitest";
import {
  isValidDate,
  validatePatronFields,
  validateDeskBooking,
  validateMove,
  type DeskBookingContext,
  type DeskBookingFields,
  type MoveContext,
} from "@/lib/booking-input";
import type { OpeningHours } from "@/types/domain";

const TZ = "America/New_York";
const hours: OpeningHours = { wed: { open: "09:00", close: "20:00" }, thu: { open: "09:00", close: "20:00" } };
// Wednesday 2026-11-18 at 1:55 PM in New York.
const now = new Date("2026-11-18T18:55:00Z");
const ctx: DeskBookingContext = { room: { type: "study", capacity: 4 }, openingHours: hours, timeZone: TZ, now };
const fields = (over: Partial<DeskBookingFields> = {}): DeskBookingFields => ({
  date: "2026-11-18",
  start: "14:00",
  end: "15:00",
  patronName: "  Ana Ruiz ",
  cardLast4: "1234",
  partySize: "2",
  ...over,
});
const errorsOf = (over: Partial<DeskBookingFields>, c = ctx) => {
  const result = validateDeskBooking(fields(over), c);
  return result.ok ? {} : result.fieldErrors;
};

describe("validateDeskBooking", () => {
  it("accepts a valid booking and trims the name", () => {
    const result = validateDeskBooking(fields(), ctx);
    expect(result).toEqual({
      ok: true,
      value: {
        start: new Date("2026-11-18T19:00:00Z"),
        end: new Date("2026-11-18T20:00:00Z"),
        patronName: "Ana Ruiz",
        cardLast4: "1234",
        partySize: 2,
      },
    });
  });

  it("books from the current minute with a Now start", () => {
    const result = validateDeskBooking(fields({ start: "now", end: "14:30" }), ctx);
    expect(result.ok && result.value.start).toEqual(new Date("2026-11-18T18:55:00Z"));
  });

  it("rejects a Now start on another day", () => {
    expect(errorsOf({ date: "2026-11-19", start: "now" }).start).toBe("Choose a start time.");
  });

  it("checks the patron fields", () => {
    expect(errorsOf({ patronName: "   " }).patronName).toBe("Enter the patron's name.");
    expect(errorsOf({ patronName: "x".repeat(81) }).patronName).toBe("Name must be 80 characters or fewer.");
    expect(errorsOf({ cardLast4: "12a4" }).cardLast4).toBe("Enter the last 4 digits of the library card.");
    expect(errorsOf({ partySize: "0" }).partySize).toBe("Party size must be between 1 and 4.");
    expect(errorsOf({ partySize: "5" }).partySize).toBe("Party size must be between 1 and 4.");
    expect(errorsOf({ partySize: "2.5" }).partySize).toBe("Party size must be between 1 and 4.");
  });

  it("rejects invalid, closed and past days", () => {
    expect(errorsOf({ date: "2026-02-30" }).start).toBe("Choose a valid day.");
    expect(errorsOf({ date: "2026-11-20" }).start).toBe("Choose a valid day.");
    expect(errorsOf({ date: "2026-11-11" }).start).toBe("This day has passed.");
  });

  it("checks start times", () => {
    expect(errorsOf({ start: "14:15" }).start).toBe("Choose a time on the hour or half hour.");
    expect(errorsOf({ start: "13:30" }).start).toBe("That time has already passed.");
    expect(errorsOf({ date: "2026-11-19", start: "08:30" }).start).toBe("The library opens at 9:00 AM.");
    expect(errorsOf({ start: "25:00" }).start).toBe("Choose a start time.");
  });

  it("checks end times", () => {
    expect(errorsOf({ end: "14:00" }).end).toBe("End must be after the start.");
    expect(errorsOf({ end: "20:30" }).end).toBe("The library closes at 8:00 PM.");
    expect(errorsOf({ end: "16:30" }).end).toBe("Bookings can be at most 2 hours for this room.");
    expect(errorsOf({ end: "" }).end).toBe("Choose an end time.");
  });

  it("allows longer bookings in meeting rooms", () => {
    const meeting: DeskBookingContext = { ...ctx, room: { type: "meeting", capacity: 10 } };
    expect(validateDeskBooking(fields({ end: "18:00" }), meeting).ok).toBe(true);
    expect(errorsOf({ end: "18:30" }, meeting).end).toBe("Bookings can be at most 4 hours for this room.");
  });
});

describe("isValidDate", () => {
  it("accepts real dates in range only", () => {
    expect(isValidDate("2026-11-18")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("1999-01-01")).toBe(false);
    expect(isValidDate("2026-1-1")).toBe(false);
  });
});

describe("validateMove", () => {
  const booking = {
    status: "booked" as const,
    startAt: new Date("2026-11-18T19:00:00Z"),
    endAt: new Date("2026-11-18T20:00:00Z"),
    partySize: 3,
  };
  const moveCtx: MoveContext = { booking, room: { type: "study", capacity: 4 }, openingHours: hours, timeZone: TZ, now };

  it("allows a room-only move at the same time", () => {
    expect(validateMove({ start: "14:00", end: "15:00" }, moveCtx)).toEqual({
      ok: true,
      value: { start: booking.startAt, end: booking.endAt },
    });
  });

  it("keeps the original start even once it has passed", () => {
    const late = { ...moveCtx, now: new Date("2026-11-18T19:10:00Z") };
    expect(validateMove({ start: "14:00", end: "15:30" }, late).ok).toBe(true);
    expect(validateMove({ start: "14:30", end: "15:30" }, late).ok).toBe(true);
  });

  it("rejects a room that is too small", () => {
    const small = { ...moveCtx, room: { type: "study" as const, capacity: 2 } };
    const result = validateMove({ start: "14:00", end: "15:00" }, small);
    expect(!result.ok && result.fieldErrors.roomId).toBe("This room fits up to 2 people; the party is 3.");
  });

  it("checks a new time like a new booking", () => {
    const errors = (start: string, end: string) => {
      const r = validateMove({ start, end }, moveCtx);
      return r.ok ? {} : r.fieldErrors;
    };
    expect(errors("13:30", "14:30").start).toBe("That time has already passed.");
    expect(errors("14:15", "15:00").start).toBe("Choose a time on the hour or half hour.");
    expect(errors("19:30", "20:30").end).toBe("The library closes at 8:00 PM.");
    expect(errors("14:00", "16:30").end).toBe("Bookings can be at most 2 hours for this room.");
    expect(errors("15:00", "15:00").end).toBe("End must be after the start.");
  });

  it("lets a checked-in booking change room only", () => {
    const checkedIn: MoveContext = { ...moveCtx, booking: { ...booking, status: "checked_in" } };
    expect(validateMove({ start: "14:00", end: "15:00" }, checkedIn).ok).toBe(true);
    const moved = validateMove({ start: "15:00", end: "16:00" }, checkedIn);
    expect(!moved.ok && moved.fieldErrors.start).toBe("A checked-in booking can only change room.");
  });
});

describe("validatePatronFields", () => {
  it("trims and accepts a valid walk-in", () => {
    expect(validatePatronFields({ patronName: "  Ana ", cardLast4: "2468", partySize: "3" }, 4)).toEqual({
      value: { patronName: "Ana", cardLast4: "2468", partySize: 3 },
      fieldErrors: {},
    });
  });

  it("rejects a missing name, a bad card and a party over capacity", () => {
    const { fieldErrors } = validatePatronFields({ patronName: " ", cardLast4: "12a4", partySize: "5" }, 4);
    expect(Object.keys(fieldErrors).sort()).toEqual(["cardLast4", "partySize", "patronName"]);
  });
});
