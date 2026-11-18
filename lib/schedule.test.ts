import { describe, expect, it } from "vitest";
import type { RuleBooking } from "@/lib/booking-rules";
import {
  activeIntervals,
  availableNow,
  endOptions,
  findAlternatives,
  matchesBookingQuery,
  freeSlots,
  openingHoursFor,
  roomStateAt,
  startOptions,
  type RoomState,
} from "@/lib/schedule";
import type { OpeningHours } from "@/types/domain";

const TZ = "America/New_York";
const settings = { earlyCheckinMin: 10, checkinWindowMin: 15 };
const hours: OpeningHours = {
  mon: { open: "09:00", close: "20:00" },
  tue: { open: "09:00", close: "20:00" },
  wed: { open: "09:00", close: "20:00" },
  thu: { open: "09:00", close: "20:00" },
  fri: { open: "10:00", close: "18:00" },
  sat: { open: "10:00", close: "18:00" },
  sun: { open: "10:00", close: "18:00" },
};
// 2026-11-18 is a Wednesday; New York is UTC-5, so local 14:00 is 19:00Z.
const local = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 18, h + 5, m));
};
const open = { start: local("09:00"), end: local("20:00") };

const booking = (start: string, end: string, over: Partial<RuleBooking> = {}): RuleBooking => ({
  status: "booked",
  startAt: local(start),
  endAt: local(end),
  checkedInAt: null,
  ...over,
});

describe("openingHoursFor", () => {
  it("uses the weekday's hours", () => {
    expect(openingHoursFor("2026-11-18", hours, TZ)).toEqual(open);
    const fri = openingHoursFor("2026-11-20", hours, TZ);
    expect(fri?.start.toISOString()).toBe("2026-11-20T15:00:00.000Z");
    expect(fri?.end.toISOString()).toBe("2026-11-20T23:00:00.000Z");
  });

  it("is null for a day without hours", () => {
    expect(openingHoursFor("2026-11-18", {}, TZ)).toBeNull();
  });
});

describe("activeIntervals", () => {
  it("drops released, cancelled and overdue no-show bookings", () => {
    const now = local("13:55");
    const intervals = activeIntervals(
      [
        booking("10:00", "11:00", { status: "released" }),
        booking("11:00", "12:00", { status: "cancelled" }),
        booking("12:00", "13:00"),
        booking("10:00", "11:00", { status: "checked_in", checkedInAt: local("10:00") }),
        booking("14:00", "15:00"),
      ],
      settings,
      now,
    );
    expect(intervals).toEqual([
      { start: local("10:00"), end: local("11:00") },
      { start: local("14:00"), end: local("15:00") },
    ]);
  });
});

describe("freeSlots", () => {
  it("is the whole day with no bookings", () => {
    expect(freeSlots(open, [], local("08:00"))).toEqual([open]);
  });

  it("leaves no gap between back-to-back bookings", () => {
    const busy = [
      { start: local("10:00"), end: local("11:00") },
      { start: local("11:00"), end: local("12:00") },
    ];
    expect(freeSlots(open, busy, local("08:00"))).toEqual([
      { start: local("09:00"), end: local("10:00") },
      { start: local("12:00"), end: local("20:00") },
    ]);
  });

  it("starts at now and drops slivers under 30 minutes", () => {
    const busy = [{ start: local("14:00"), end: local("15:00") }];
    expect(freeSlots(open, busy, local("13:55"))).toEqual([{ start: local("15:00"), end: local("20:00") }]);
    expect(freeSlots(open, busy, local("13:20"))).toEqual([
      { start: local("13:20"), end: local("14:00") },
      { start: local("15:00"), end: local("20:00") },
    ]);
  });

  it("is empty after closing", () => {
    expect(freeSlots(open, [], local("20:00"))).toEqual([]);
  });
});

describe("roomStateAt", () => {
  it("is closed outside opening hours", () => {
    expect(roomStateAt(local("08:59"), [], settings, open)).toEqual({ kind: "closed" });
    expect(roomStateAt(local("20:00"), [], settings, open)).toEqual({ kind: "closed" });
  });

  it("is in use during a checked-in booking", () => {
    const b = booking("13:00", "15:00", { status: "checked_in", checkedInAt: local("13:04") });
    expect(roomStateAt(local("13:55"), [b], settings, open)).toEqual({ kind: "in_use", until: local("15:00") });
  });

  it("awaits check-in while a booking's window is open", () => {
    const b = booking("14:00", "15:00");
    expect(roomStateAt(local("13:50"), [b], settings, open)).toEqual({
      kind: "awaiting_check_in",
      closesAt: local("14:15"),
    });
  });

  it("is free until the next booking, or closing", () => {
    const b = booking("15:00", "16:00");
    expect(roomStateAt(local("13:55"), [b], settings, open)).toEqual({ kind: "free", until: local("15:00") });
    expect(roomStateAt(local("16:30"), [b], settings, open)).toEqual({ kind: "free", until: local("20:00") });
  });

  it("is free once a no-show is past its window", () => {
    const b = booking("13:00", "15:00");
    expect(roomStateAt(local("13:16"), [b], settings, open)).toEqual({ kind: "free", until: local("20:00") });
  });
});

describe("availableNow", () => {
  it("lists free rooms, free the longest first", () => {
    const rooms = [
      { id: "a", name: "A", type: "study" as const, capacity: 4 },
      { id: "b", name: "B", type: "study" as const, capacity: 4 },
      { id: "c", name: "C", type: "meeting" as const, capacity: 8 },
    ];
    const states = new Map<string, RoomState>([
      ["a", { kind: "free", until: local("15:00") }],
      ["b", { kind: "in_use", until: local("15:00") }],
      ["c", { kind: "free", until: local("20:00") }],
    ]);
    expect(availableNow(rooms, states).map((r) => [r.room.id, r.freeUntil])).toEqual([
      ["c", local("20:00")],
      ["a", local("15:00")],
    ]);
  });
});

describe("findAlternatives", () => {
  const rooms = [
    { id: "a", name: "Study Room A", type: "study" as const, capacity: 4 },
    { id: "b", name: "Study Room B", type: "study" as const, capacity: 2 },
    { id: "c", name: "Oak Meeting Room", type: "meeting" as const, capacity: 10 },
  ];

  it("offers later same-room slots and other free rooms with enough capacity", () => {
    const busyByRoom = new Map([
      ["a", [{ start: local("14:00"), end: local("15:00") }, { start: local("16:00"), end: local("17:00") }]],
      ["c", [{ start: local("14:00"), end: local("16:00") }]],
    ]);
    const result = findAlternatives({
      roomId: "a",
      start: local("14:30"),
      end: local("15:30"),
      partySize: 3,
      rooms,
      busyByRoom,
      open,
    });
    expect(result.sameRoom.map((s) => [s.start, s.end])).toEqual([
      [local("15:00"), local("16:00")],
      [local("17:00"), local("18:00")],
      [local("17:30"), local("18:30")],
    ]);
    // B is too small for 3 people and Oak is busy.
    expect(result.otherRooms).toEqual([]);
  });

  it("lists other rooms free for the same time", () => {
    const result = findAlternatives({
      roomId: "a",
      start: local("14:00"),
      end: local("15:00"),
      partySize: 2,
      rooms,
      busyByRoom: new Map([["a", [{ start: local("14:00"), end: local("15:00") }]]]),
      open,
    });
    expect(result.otherRooms.map((r) => r.roomId)).toEqual(["b", "c"]);
  });

  it("is empty when nothing later fits", () => {
    const result = findAlternatives({
      roomId: "a",
      start: local("19:00"),
      end: local("20:00"),
      partySize: 20,
      rooms,
      busyByRoom: new Map(),
      open,
    });
    expect(result).toEqual({ sameRoom: [], otherRooms: [] });
  });
});

describe("startOptions and endOptions", () => {
  it("leads with Now when the current minute is between boundaries", () => {
    const options = startOptions(open, local("13:55"), TZ);
    expect(options[0]).toMatchObject({ value: "now", label: "Now (1:55 PM)" });
    expect(options[1]).toMatchObject({ value: "14:00", label: "2:00 PM" });
    expect(options.at(-1)).toMatchObject({ value: "19:30" });
  });

  it("starts at the boundary itself when now is on one", () => {
    expect(startOptions(open, local("14:00"), TZ)[0]).toMatchObject({ value: "14:00" });
  });

  it("offers every boundary on a future day", () => {
    const options = startOptions(open, local("06:00"), TZ);
    expect(options[0]).toMatchObject({ value: "09:00" });
    expect(options).toHaveLength(22);
  });

  it("limits end times to closing and the room's maximum", () => {
    expect(endOptions(open, local("14:00"), 120, TZ).map((o) => o.value)).toEqual(["14:30", "15:00", "15:30", "16:00"]);
    expect(endOptions(open, local("19:00"), 120, TZ).map((o) => o.value)).toEqual(["19:30", "20:00"]);
    expect(endOptions(open, local("13:55"), 120, TZ)[0].value).toBe("14:00");
  });
});

describe("matchesBookingQuery", () => {
  const b = { patronName: "Daniel Okafor", cardLast4: "7390" };

  it("matches part of the name, ignoring case and spaces around it", () => {
    expect(matchesBookingQuery(b, " okaf ")).toBe(true);
    expect(matchesBookingQuery(b, "Maria")).toBe(false);
  });

  it("matches the start of the card's last 4 for digits", () => {
    expect(matchesBookingQuery(b, "73")).toBe(true);
    expect(matchesBookingQuery(b, "7390")).toBe(true);
    expect(matchesBookingQuery(b, "390")).toBe(false);
  });

  it("matches nothing for an empty query", () => {
    expect(matchesBookingQuery(b, "  ")).toBe(false);
  });
});
