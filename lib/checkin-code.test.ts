import { describe, expect, it } from "vitest";
import { checkinCode, msUntilNextCode, verifyCheckinCode } from "@/lib/checkin-code";

const SECRET = "unit-secret";
const ROOM = "11111111-1111-4111-8111-111111111111";
const OTHER_ROOM = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 10, 18, 14, 0, 30);
const MIN = 60_000;

describe("checkinCode", () => {
  it("is always six digits and stable for the same minute", () => {
    const code = checkinCode(SECRET, ROOM, NOW);
    expect(code).toMatch(/^\d{6}$/);
    expect(checkinCode(SECRET, ROOM, NOW - 30_000)).toBe(code);
  });

  it("zero-pads short values", () => {
    let minute = Math.floor(NOW / MIN);
    let code = checkinCode(SECRET, ROOM, minute * MIN);
    while (!code.startsWith("0")) {
      minute += 1;
      code = checkinCode(SECRET, ROOM, minute * MIN);
    }
    expect(code).toHaveLength(6);
  });

  it("changes with the room and the secret", () => {
    const code = checkinCode(SECRET, ROOM, NOW);
    expect(checkinCode(SECRET, OTHER_ROOM, NOW)).not.toBe(code);
    expect(checkinCode("another-secret", ROOM, NOW)).not.toBe(code);
  });
});

describe("verifyCheckinCode", () => {
  const current = checkinCode(SECRET, ROOM, NOW);

  it("accepts the current and the previous minute's code", () => {
    expect(verifyCheckinCode(SECRET, ROOM, current, NOW)).toBe(true);
    expect(verifyCheckinCode(SECRET, ROOM, checkinCode(SECRET, ROOM, NOW - MIN), NOW)).toBe(true);
  });

  it("rejects a code from two minutes ago or the next minute", () => {
    expect(verifyCheckinCode(SECRET, ROOM, checkinCode(SECRET, ROOM, NOW - 2 * MIN), NOW)).toBe(false);
    expect(verifyCheckinCode(SECRET, ROOM, checkinCode(SECRET, ROOM, NOW + MIN), NOW)).toBe(false);
  });

  it("rejects the code for another room or another secret", () => {
    expect(verifyCheckinCode(SECRET, OTHER_ROOM, current, NOW)).toBe(false);
    expect(verifyCheckinCode("another-secret", ROOM, current, NOW)).toBe(false);
  });

  it("ignores spaces and hyphens", () => {
    const spaced = ` ${current.slice(0, 3)} ${current.slice(3)} `;
    expect(verifyCheckinCode(SECRET, ROOM, spaced, NOW)).toBe(true);
    expect(verifyCheckinCode(SECRET, ROOM, `${current.slice(0, 3)}-${current.slice(3)}`, NOW)).toBe(true);
  });

  it.each(["", "12345", "1234567", "12a456", "abcdef"])("rejects malformed input %j", (input) => {
    expect(verifyCheckinCode(SECRET, ROOM, input, NOW)).toBe(false);
  });
});

describe("msUntilNextCode", () => {
  it("is a full minute at the start of a minute and 1 ms at its end", () => {
    const start = Math.floor(NOW / MIN) * MIN;
    expect(msUntilNextCode(start)).toBe(MIN);
    expect(msUntilNextCode(start + MIN - 1)).toBe(1);
  });
});
