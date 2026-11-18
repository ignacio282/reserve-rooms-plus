import { describe, expect, it } from "vitest";
import { libraryDateString, libraryDayBounds, libraryNow, libraryTimeString, zonedTimeToUtc } from "@/lib/clock";

const TZ = "America/New_York";

describe("libraryNow", () => {
  const real = Date.UTC(2026, 10, 18, 15, 0, 0);

  it("adds a positive offset", () => {
    expect(libraryNow(real, 900).toISOString()).toBe("2026-11-18T15:15:00.000Z");
  });

  it("subtracts a negative offset", () => {
    expect(libraryNow(real, -3600).toISOString()).toBe("2026-11-18T14:00:00.000Z");
  });

  it("returns real time with no offset", () => {
    expect(libraryNow(real, 0).getTime()).toBe(real);
  });
});

describe("libraryDayBounds", () => {
  it("covers a normal 24-hour day", () => {
    const { start, end } = libraryDayBounds(new Date("2026-11-18T18:00:00Z"), TZ);
    expect(start.toISOString()).toBe("2026-11-18T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-19T05:00:00.000Z");
  });

  it("covers the 23-hour spring-forward day", () => {
    const { start, end } = libraryDayBounds(new Date("2026-03-08T12:00:00Z"), TZ);
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("covers the 25-hour fall-back day", () => {
    const { start, end } = libraryDayBounds(new Date("2026-11-01T12:00:00Z"), TZ);
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("uses the library's date for an instant just before local midnight", () => {
    // 11:59 PM on Nov 18 in New York is already Nov 19 in UTC.
    const { start } = libraryDayBounds(new Date("2026-11-19T04:59:00Z"), TZ);
    expect(start.toISOString()).toBe("2026-11-18T05:00:00.000Z");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a normal library-local time", () => {
    expect(zonedTimeToUtc("2026-11-18", "14:00", TZ).toISOString()).toBe("2026-11-18T19:00:00.000Z");
  });

  it("moves a time skipped by spring forward to the next hour", () => {
    expect(zonedTimeToUtc("2026-03-08", "02:30", TZ).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("handles a time just after spring forward", () => {
    expect(zonedTimeToUtc("2026-03-08", "03:30", TZ).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves a repeated fall-back time to its first occurrence", () => {
    expect(zonedTimeToUtc("2026-11-01", "01:30", TZ).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("libraryDateString and libraryTimeString", () => {
  it("uses the library's calendar near midnight", () => {
    const instant = new Date("2026-11-19T04:59:00Z");
    expect(libraryDateString(instant, TZ)).toBe("2026-11-18");
    expect(libraryTimeString(instant, TZ)).toBe("23:59");
  });
});
