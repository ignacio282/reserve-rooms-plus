import { describe, expect, it } from "vitest";
import { changedLiveKeys, FALLBACK_POLL_MS, isLivePaused, LIVE_POLL_MS, liveMode } from "@/lib/live";

describe("liveMode", () => {
  it("is live only when subscribed with config", () => {
    expect(liveMode("SUBSCRIBED", true)).toEqual({ mode: "live", pollMs: LIVE_POLL_MS });
  });

  it.each([null, "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])("falls back for status %s", (status) => {
    expect(liveMode(status, true)).toEqual({ mode: "fallback", pollMs: FALLBACK_POLL_MS });
  });

  it("falls back without config even if subscribed", () => {
    expect(liveMode("SUBSCRIBED", false).mode).toBe("fallback");
  });
});

describe("isLivePaused", () => {
  it("pauses only the patron confirm page", () => {
    expect(isLivePaused("/book/39a75f55-822d-4107-8759-42ba3ba94d2f/confirm")).toBe(true);
    expect(isLivePaused("/book/39a75f55-822d-4107-8759-42ba3ba94d2f")).toBe(false);
    expect(isLivePaused("/book/done/39a75f55-822d-4107-8759-42ba3ba94d2f")).toBe(false);
    expect(isLivePaused("/")).toBe(false);
  });
});

describe("changedLiveKeys", () => {
  const before = new Map([
    ["a", "booked"],
    ["b", "booked"],
    ["c", "booked"],
  ]);

  it("returns new and changed keys, ignoring unchanged and removed ones", () => {
    const after = new Map([
      ["a", "booked"],
      ["b", "checked_in"],
      ["d", "booked"],
    ]);
    expect(changedLiveKeys(before, after)).toEqual(["b", "d"]);
  });

  it("returns nothing on first render", () => {
    expect(changedLiveKeys(new Map(), new Map([["a", "booked"]]))).toEqual([]);
  });

  it("returns nothing when nothing changed", () => {
    expect(changedLiveKeys(before, new Map(before))).toEqual([]);
  });
});
