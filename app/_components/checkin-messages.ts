import type { CheckInOutcome } from "@/lib/checkin";
import { formatTime } from "@/lib/format";

export type CheckInResult =
  | { success: true; message: string }
  | { success: false; error: string; kind: "invalid" | "wrong_code" | "paused" | "state" | "unexpected" }
  | null;

export const UNEXPECTED = "Something went wrong. Try again.";
export const NEED_ROOM_CODE = "Enter the 6-digit code shown on the room's door display.";
export const WRONG_CODE = "That code has changed or is not right. Enter the code shown on the room's door display now.";
export const PAUSED_BOOKING =
  "Check-in is paused after too many wrong codes. Scan the QR code on the room's door display, or ask at the front desk.";
export const PAUSED_ROOM =
  "Check-in on this page is paused after too many wrong codes. Ask at the front desk, or try again in a few minutes.";

/** Why a booking cannot be checked in right now, in plain words. Null when the window is open. */
export function outcomeMessage(outcome: CheckInOutcome, timeZone: string): string | null {
  switch (outcome.kind) {
    case "too_early":
      return `Check-in opens at ${formatTime(outcome.opensAt, timeZone)}.`;
    case "released":
      return `This booking was released - nobody checked in by ${formatTime(outcome.closesAt, timeZone)}.`;
    case "checked_in":
      return "This booking is already checked in.";
    case "cancelled":
      return "This booking was cancelled.";
    case "completed":
      return "This booking has ended.";
    default:
      return null;
  }
}
