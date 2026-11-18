import { describe, expect, it } from "vitest";
import { checkInAvailability, checkInWindow, deriveStatus, type RuleBooking } from "@/lib/booking-rules";

const settings = { earlyCheckinMin: 10, checkinWindowMin: 15 };
const at = (hhmm: string, extraMs = 0) => new Date(new Date(`2026-11-18T${hhmm}:00Z`).getTime() + extraMs);

const booking = (over: Partial<RuleBooking> = {}): RuleBooking => ({
  status: "booked",
  startAt: at("14:00"),
  endAt: at("15:00"),
  checkedInAt: null,
  ...over,
});

describe("checkInWindow", () => {
  it("opens 10 minutes before start and closes 15 minutes after", () => {
    const { opensAt, closesAt } = checkInWindow(booking(), settings);
    expect(opensAt).toEqual(at("13:50"));
    expect(closesAt).toEqual(at("14:15"));
  });
});

describe("checkInAvailability", () => {
  it("is too early 1 ms before the window opens", () => {
    expect(checkInAvailability(booking(), settings, at("13:50", -1))).toEqual({
      state: "too_early",
      opensAt: at("13:50"),
    });
  });

  it("is open exactly when the window opens and exactly when it closes", () => {
    expect(checkInAvailability(booking(), settings, at("13:50")).state).toBe("open");
    expect(checkInAvailability(booking(), settings, at("14:15"))).toEqual({ state: "open", closesAt: at("14:15") });
  });

  it("is closed 1 ms after the window closes", () => {
    expect(checkInAvailability(booking(), settings, at("14:15", 1)).state).toBe("closed");
  });
});

describe("deriveStatus", () => {
  it("keeps a stored cancellation even if it was checked in", () => {
    expect(deriveStatus(booking({ status: "cancelled", checkedInAt: at("13:55") }), settings, at("14:30"))).toBe(
      "cancelled",
    );
  });

  it("keeps a stored release", () => {
    expect(deriveStatus(booking({ status: "released" }), settings, at("14:00"))).toBe("released");
  });

  it("is checked in before the end and completed at exactly the end", () => {
    const b = booking({ status: "checked_in", checkedInAt: at("13:55") });
    expect(deriveStatus(b, settings, at("15:00", -1))).toBe("checked_in");
    expect(deriveStatus(b, settings, at("15:00"))).toBe("completed");
  });

  it("is booked through the end of the check-in window", () => {
    expect(deriveStatus(booking(), settings, at("13:00"))).toBe("booked");
    expect(deriveStatus(booking(), settings, at("14:15"))).toBe("booked");
  });

  it("is released 1 ms after the window closes without a check-in", () => {
    expect(deriveStatus(booking(), settings, at("14:15", 1))).toBe("released");
  });
});
