import { describe, expect, it } from "vitest";
import { formatDayLabel, formatPercent, formatTime, formatTimeRange } from "@/lib/format";

describe("formatPercent", () => {
  it("formats a ratio as a whole percentage", () => {
    expect(formatPercent(7, 10)).toBe("70%");
    expect(formatPercent(3, 10)).toBe("30%");
  });

  it("rounds to the nearest whole percent", () => {
    expect(formatPercent(2, 3)).toBe("67%");
  });

  it("returns 0% when there is nothing to measure", () => {
    expect(formatPercent(0, 0)).toBe("0%");
  });
});

describe("time formatting", () => {
  const TZ = "America/New_York";
  const at = (iso: string) => new Date(iso);

  it("formats a time in the library timezone", () => {
    expect(formatTime(at("2026-11-18T19:00:00Z"), TZ)).toBe("2:00 PM");
  });

  it("shares the period inside a range", () => {
    expect(formatTimeRange(at("2026-11-18T19:00:00Z"), at("2026-11-18T20:00:00Z"), TZ)).toBe("2:00-3:00 PM");
  });

  it("keeps both periods when a range crosses noon", () => {
    expect(formatTimeRange(at("2026-11-18T16:30:00Z"), at("2026-11-18T17:30:00Z"), TZ)).toBe("11:30 AM-12:30 PM");
  });

  it("labels a day", () => {
    expect(formatDayLabel("2026-11-18")).toBe("Wed, Nov 18");
  });
});
