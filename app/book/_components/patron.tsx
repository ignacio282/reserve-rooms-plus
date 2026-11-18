import Link from "next/link";
import { connection } from "next/server";
import { libraryDateString } from "@/lib/clock";
import { formatDayLabel, formatTime } from "@/lib/format";
import { bookingDays, type RoomState } from "@/lib/schedule";
import { getLibraryContext } from "@/lib/server/library";
import type { RoomRow } from "@/types/domain";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BOOKING_DAYS = 7;

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}

/** Library settings and the shared clock, plus the days a patron may book. */
export async function patronContext() {
  await connection();
  const ctx = await getLibraryContext();
  const today = libraryDateString(ctx.now, ctx.library.timezone);
  return { ...ctx, today, days: bookingDays(today, BOOKING_DAYS) };
}

export function dayLabel(date: string, days: string[]): string {
  if (date === days[0]) return "Today";
  if (date === days[1]) return "Tomorrow";
  return formatDayLabel(date);
}

export const TYPE_LABEL: Record<RoomRow["type"], string> = {
  study: "Study room",
  meeting: "Meeting room",
  community: "Community room",
};

export function PatronHeader({ libraryName }: { libraryName: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/book" className="font-semibold">
          {libraryName}
        </Link>
        <span className="text-sm text-muted">Book a room</span>
      </div>
    </header>
  );
}

export function RoomFacts({ room }: { room: RoomRow }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p>
        {TYPE_LABEL[room.type]} · Up to {room.capacity} {room.capacity === 1 ? "person" : "people"}
      </p>
      <p className="text-sm text-muted">{room.location_in_building}</p>
      {room.amenities.length ? (
        <ul aria-label="Amenities" className="mt-1 flex flex-wrap gap-1.5">
          {room.amenities.map((a) => (
            <li key={a} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const STATE_STYLE: Record<RoomState["kind"], { text: string; dot: string }> = {
  free: { text: "text-accent", dot: "bg-accent" },
  in_use: { text: "text-checked", dot: "bg-checked-edge" },
  awaiting_check_in: { text: "text-booked", dot: "bg-booked-edge" },
  closed: { text: "text-muted", dot: "bg-line-strong" },
};

export function RoomStateLine({ state, timeZone }: { state: RoomState; timeZone: string }) {
  const text =
    state.kind === "free"
      ? `Free now until ${formatTime(state.until, timeZone)}`
      : state.kind === "in_use"
        ? `In use until ${formatTime(state.until, timeZone)}`
        : state.kind === "awaiting_check_in"
          ? "Booked now"
          : "Closed now";
  return (
    <p className={`flex items-center gap-2 text-sm font-medium ${STATE_STYLE[state.kind].text}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATE_STYLE[state.kind].dot}`} />
      {text}
    </p>
  );
}

export function PatronLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <p role="status" className="text-muted">
        Loading...
      </p>
    </main>
  );
}
