import type { IconName } from "@/app/_components/Icon";
import type { RoomCheckInView } from "@/lib/checkin";
import { formatTime } from "@/lib/format";

export interface RoomStatusText {
  headline: string;
  detail: string | null;
  icon: IconName;
  /** Tailwind classes for the status: always paired with text and an icon. */
  tone: string;
}

/** Room state in plain words for the door display and the room check-in page. Never names patrons. */
export function roomStatusText(view: RoomCheckInView, timeZone: string): RoomStatusText {
  const at = (d: Date) => formatTime(d, timeZone);
  const { state, nextFree, upcoming } = view;
  const upcomingText = upcoming ? `Check-in for the ${at(upcoming.startAt)} booking opens at ${at(upcoming.opensAt)}.` : null;
  switch (state.kind) {
    case "free":
      return {
        headline: `Available now until ${at(state.until)}`,
        detail: upcomingText,
        icon: "check",
        tone: "border-accent bg-accent-soft text-accent",
      };
    case "in_use":
      return {
        headline: `In use until ${at(state.until)}`,
        detail: nextFree ? `Free next at ${at(nextFree)}.` : "Not free again today.",
        icon: "key",
        tone: "border-checked-edge bg-checked-bg text-checked",
      };
    case "awaiting_check_in":
      return {
        headline: "Booked - awaiting check-in",
        detail: `Check-in closes at ${at(state.closesAt)}.${nextFree ? ` Free next at ${at(nextFree)}.` : ""}`,
        icon: "clock",
        tone: "border-booked-edge bg-booked-bg text-booked",
      };
    default:
      return {
        headline: "Closed now",
        detail: upcomingText,
        icon: "x",
        tone: "border-line-strong bg-surface-2 text-muted",
      };
  }
}
