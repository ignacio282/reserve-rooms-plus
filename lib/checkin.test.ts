import { describe, expect, it } from "vitest";
import {
  bookingCheckInOutcome,
  isPaused,
  matchBooking,
  parseIdentifier,
  roomCheckInView,
  walkInEnd,
  walkInStart,
  type MatchableBooking,
} from "@/lib/checkin";

const settings = { earlyCheckinMin: 10, checkinWindowMin: 15 };
// Local times on one UTC day keep the tests timezone-free.
const t = (hhmm: string, sec = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 18, h, m, sec));
};
const open = { start: t("09:00"), end: t("20:00") };

const booking = (start: string, end: string, over: Partial<MatchableBooking> = {}): MatchableBooking => ({
  status: "booked",
  startAt: t(start),
  endAt: t(end),
  checkedInAt: null,
  bookingCode: "ABC234",
  cardLast4: "1234",
  ...over,
});

describe("parseIdentifier", () => {
  it("reads 4 digits as a card and 6 code characters as a booking code", () => {
    expect(parseIdentifier(" 2468 ")).toEqual({ kind: "card", value: "2468" });
    expect(parseIdentifier("abc234")).toEqual({ kind: "code", value: "ABC234" });
  });

  it("rejects anything else, including ambiguous code characters", () => {
    for (const bad of ["", "123", "12345", "ABC2340", "ABO234", "AB-234"]) expect(parseIdentifier(bad)).toBeNull();
  });
});

describe("bookingCheckInOutcome", () => {
  const b = booking("14:00", "15:00");

  it("is too early before start - 10 and open from exactly then", () => {
    expect(bookingCheckInOutcome(b, settings, t("13:49", 59))).toEqual({ kind: "too_early", opensAt: t("13:50") });
    expect(bookingCheckInOutcome(b, settings, t("13:50"))).toEqual({ kind: "open", closesAt: t("14:15") });
  });

  it("is open at exactly start + 15 and released after", () => {
    expect(bookingCheckInOutcome(b, settings, t("14:15")).kind).toBe("open");
    expect(bookingCheckInOutcome(b, settings, t("14:15", 1))).toEqual({ kind: "released", closesAt: t("14:15") });
  });

  it("reports stored states", () => {
    expect(bookingCheckInOutcome({ ...b, status: "released" }, settings, t("14:20")).kind).toBe("released");
    expect(bookingCheckInOutcome({ ...b, status: "cancelled" }, settings, t("14:00")).kind).toBe("cancelled");
    const checked = { ...b, status: "checked_in" as const, checkedInAt: t("14:02") };
    expect(bookingCheckInOutcome(checked, settings, t("14:20")).kind).toBe("checked_in");
    expect(bookingCheckInOutcome(checked, settings, t("15:00")).kind).toBe("completed");
  });
});

describe("matchBooking", () => {
  const morning = booking("10:00", "11:00", { bookingCode: "MMMMM2" });
  const afternoon = booking("16:00", "17:00", { bookingCode: "PPPPP3" });
  const now = booking("14:00", "15:00", { bookingCode: "NNNNN4" });

  it("matches by booking code regardless of case", () => {
    expect(matchBooking([morning, afternoon], { kind: "code", value: "PPPPP3" }, settings, t("12:00"))).toBe(afternoon);
    expect(matchBooking([morning], { kind: "code", value: "ZZZZZ9" }, settings, t("12:00"))).toBeNull();
  });

  it("prefers the booking whose window is open when a card matches several", () => {
    expect(matchBooking([morning, now, afternoon], { kind: "card", value: "1234" }, settings, t("14:05"))).toBe(now);
  });

  it("then the nearest upcoming booking, then the most recently released", () => {
    const later = booking("18:00", "19:00");
    expect(matchBooking([later, afternoon], { kind: "card", value: "1234" }, settings, t("12:00"))).toBe(afternoon);
    expect(matchBooking([morning, now], { kind: "card", value: "1234" }, settings, t("15:30"))).toBe(now);
  });

  it("ignores other cards", () => {
    expect(matchBooking([now], { kind: "card", value: "9999" }, settings, t("14:05"))).toBeNull();
  });
});

describe("roomCheckInView", () => {
  it("shows the next booking's check-in opening in a free room", () => {
    const view = roomCheckInView(t("13:30"), [booking("14:00", "15:00")], settings, open);
    expect(view.state).toEqual({ kind: "free", until: t("14:00") });
    expect(view.upcoming).toEqual({ startAt: t("14:00"), opensAt: t("13:50") });
    expect(view.nextFree).toBeNull();
  });

  it("gives the next free time after back-to-back bookings", () => {
    const first = booking("14:00", "15:00", { status: "checked_in", checkedInAt: t("14:01") });
    const second = booking("15:00", "16:00");
    const view = roomCheckInView(t("14:30"), [first, second], settings, open);
    expect(view.state).toEqual({ kind: "in_use", until: t("15:00") });
    expect(view.nextFree).toEqual(t("16:00"));
  });

  it("has no upcoming hint once the window is open", () => {
    const view = roomCheckInView(t("13:55"), [booking("14:00", "15:00")], settings, open);
    expect(view.state.kind).toBe("awaiting_check_in");
    expect(view.upcoming).toBeNull();
    expect(view.nextFree).toEqual(t("15:00"));
  });

  it("treats a released booking's time as free", () => {
    const view = roomCheckInView(t("14:20"), [booking("14:00", "15:00"), booking("16:00", "17:00")], settings, open);
    expect(view.state).toEqual({ kind: "free", until: t("16:00") });
  });
});

describe("walk-in", () => {
  it("starts on the current minute", () => {
    expect(walkInStart(t("14:20", 42))).toEqual(t("14:20"));
  });

  it("ends at the next booking, closing time or the max length, whichever is first", () => {
    expect(walkInEnd(t("14:20", 30), t("16:00"), 120)).toEqual(t("16:00"));
    expect(walkInEnd(t("14:20", 30), t("20:00"), 120)).toEqual(t("16:20"));
    expect(walkInEnd(t("19:30"), t("20:00"), 240)).toEqual(t("20:00"));
  });
});

describe("isPaused", () => {
  it("pauses at the fifth recent failure", () => {
    expect(isPaused(4)).toBe(false);
    expect(isPaused(5)).toBe(true);
  });
});
