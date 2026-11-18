import { describe, expect, it } from "vitest";
import { formatPercent } from "@/lib/format";

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
