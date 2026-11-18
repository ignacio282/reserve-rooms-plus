import Link from "next/link";
import type { CSSProperties } from "react";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { Icon, type IconName } from "@/app/_components/Icon";
import { OpenPanelButton } from "@/app/_components/OpenPanelButton";
import { deriveStatus, type CheckInSettings } from "@/lib/booking-rules";
import { formatTime, formatTimeRange } from "@/lib/format";
import { SLOT_MINUTES, type Interval } from "@/lib/schedule";
import type { BoardBooking } from "@/lib/server/board";
import type { RoomRow } from "@/types/domain";

const SLOT_MS = SLOT_MINUTES * 60_000;

type Shown = "booked" | "checked_in" | "completed";

const BLOCK: Record<Shown, { box: string; text: string; label: string; icon: IconName }> = {
  booked: { box: "border-booked-edge bg-booked-bg", text: "text-booked", label: "Booked - awaiting check-in", icon: "clock" },
  checked_in: { box: "border-checked-edge bg-checked-bg", text: "text-checked", label: "Checked in", icon: "check" },
  completed: { box: "border-completed-edge bg-completed-bg", text: "text-completed", label: "Completed", icon: "done" },
};

export function AllRoomsGrid({
  rooms,
  bookingsByRoom,
  open,
  settings,
  now,
  timeZone,
  isToday,
  roomHref,
  summaries,
  matches,
}: {
  rooms: RoomRow[];
  bookingsByRoom: Map<string, BoardBooking[]>;
  open: Interval | null;
  settings: CheckInSettings;
  now: Date;
  timeZone: string;
  isToday: boolean;
  roomHref: (roomId: string) => string;
  summaries: Map<string, BookingSummary>;
  matches: Set<string> | null;
}) {
  if (!open) return <p className="text-sm text-muted">The library is closed this day.</p>;
  const cells = Math.round((open.end.getTime() - open.start.getTime()) / SLOT_MS);
  const col = (t: Date) => Math.floor((t.getTime() - open.start.getTime()) / SLOT_MS) + 2;
  const showNow = isToday && now >= open.start && now < open.end;
  const frac = (now.getTime() - open.start.getTime()) / (open.end.getTime() - open.start.getTime());
  const hourCols = Array.from({ length: cells }, (_, i) => new Date(open.start.getTime() + i * SLOT_MS)).filter(
    (_, i) => i % 2 === 0,
  );

  return (
    <div role="region" aria-label="All rooms schedule" tabIndex={0} className="overflow-x-auto rounded-lg border border-line bg-surface">
      <div
        className="relative grid w-max min-w-full grid-cols-[13rem_repeat(var(--cells),minmax(3rem,1fr))] grid-rows-[2.5rem_repeat(var(--rows),minmax(6.5rem,auto))]"
        style={{ "--cells": cells, "--rows": rooms.length } as CSSProperties}
      >
        <div className="sticky left-0 z-20 row-start-1 border-b border-line bg-surface" />
        {hourCols.map((t) => (
          <div
            key={t.getTime()}
            className="col-start-[var(--col)] col-end-[span_2] row-start-1 border-b border-l border-line px-2 py-2.5 text-xs text-faint"
            style={{ "--col": col(t) } as CSSProperties}
          >
            {formatTime(t, timeZone)}
          </div>
        ))}

        {rooms.map((room, rowIndex) => {
          const row = rowIndex + 2;
          const blocks = (bookingsByRoom.get(room.id) ?? [])
            .map((b) => ({ ...b, derived: deriveStatus(b, settings, now) }))
            .filter((b): b is BoardBooking & { derived: Shown } =>
              b.derived === "booked" || b.derived === "checked_in" || b.derived === "completed",
            );
          return [
            <div
              key={`${room.id}-name`}
              className="sticky left-0 z-20 col-start-1 row-start-[var(--row)] flex flex-col justify-center gap-1 border-b border-line bg-surface px-4 py-4"
              style={{ "--row": row } as CSSProperties}
            >
              <Link href={roomHref(room.id)} className="font-medium text-accent underline-offset-2 hover:underline">
                {room.name}
              </Link>
              <span className="text-sm text-muted">Maximum capacity: {room.capacity}</span>
            </div>,
            <div
              key={`${room.id}-track`}
              className="col-start-2 col-end-[-1] row-start-[var(--row)] border-b border-line bg-accent-soft/40"
              style={{ "--row": row } as CSSProperties}
              aria-hidden="true"
            />,
            ...blocks.map((b) => {
              const look = BLOCK[b.derived];
              const summary = summaries.get(b.id);
              const highlight = matches ? (matches.has(b.id) ? "ring-2 ring-accent ring-offset-1" : "opacity-35") : "";
              const span = Math.max(1, Math.ceil((b.endAt.getTime() - b.startAt.getTime()) / SLOT_MS));
              return (
                <div
                  key={b.id}
                  className={`z-10 col-start-[var(--col)] col-end-[span_var(--span)] row-start-[var(--row)] mx-1 my-2 flex min-w-0 ${highlight}`}
                  style={{ "--row": row, "--col": col(b.startAt), "--span": span } as CSSProperties}
                >
                  <OpenPanelButton
                    booking={summary!}
                    label={`${b.patronName}, ${room.name}, ${formatTimeRange(b.startAt, b.endAt, timeZone)}. Open booking`}
                    className={`flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-md border px-2.5 py-2 text-left hover:border-accent ${look.box}`}
                  >
                  <span className="truncate text-sm font-semibold">{b.patronName}</span>
                  <span className="sr-only">{formatTimeRange(b.startAt, b.endAt, timeZone)}</span>
                  <span className="truncate text-xs text-muted">
                    Card {b.cardLast4} · Party of {b.partySize}
                  </span>
                  <span className={`flex items-center gap-1 truncate text-xs font-medium ${look.text}`}>
                    <Icon name={look.icon} className="size-3.5" />
                    {look.label}
                  </span>
                  </OpenPanelButton>
                </div>
              );
            }),
          ];
        })}

        {showNow ? (
          <>
            <div
              className="pointer-events-none absolute top-10 bottom-0 left-52 z-0 w-[calc(var(--frac)*(100%-13rem))] bg-surface-2/60"
              style={{ "--frac": frac } as CSSProperties}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute top-10 bottom-0 left-[calc(13rem+var(--frac)*(100%-13rem))] z-30 border-l-2 border-now"
              style={{ "--frac": frac } as CSSProperties}
              aria-hidden="true"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
