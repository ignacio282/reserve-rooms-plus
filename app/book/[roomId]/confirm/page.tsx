import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmForm } from "@/app/book/_components/ConfirmForm";
import {
  dayLabel,
  param,
  PatronHeader,
  PatronLoading,
  patronContext,
  UUID_RE,
  type SearchParams,
} from "@/app/book/_components/patron";
import { Icon } from "@/app/_components/Icon";
import { isValidTime, MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { zonedTimeToUtc } from "@/lib/clock";
import { formatDayLabel, formatTimeRange } from "@/lib/format";
import { lengthOptions, startSlots } from "@/lib/schedule";
import { loadPatronDay } from "@/lib/server/patron";

async function Confirm({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ roomId }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(roomId)) notFound();
  const { library, now, today, days } = await patronContext();
  const tz = library.timezone;
  const date = param(sp, "date");
  const start = param(sp, "start");
  const end = param(sp, "end");
  const validDate = days.includes(date);
  const day = await loadPatronDay(library, validDate ? date : today, now, false);
  const room = day.rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  let available = false;
  if (validDate && day.open && isValidTime(start) && isValidTime(end)) {
    const busy = day.busyByRoom.get(room.id) ?? [];
    const slot = startSlots(day.open, busy, now, tz).find((s) => s.value === start && s.state === "available");
    if (slot) {
      const minutes = (zonedTimeToUtc(date, end, tz).getTime() - slot.at.getTime()) / 60_000;
      available = lengthOptions(slot.at, busy, day.open.end, MAX_MINUTES_BY_TYPE[room.type]).includes(minutes);
    }
  }
  const backHref = `/book/${room.id}${validDate ? `?date=${date}` : ""}`;

  return (
    <>
      <PatronHeader libraryName={library.name} live={false} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <Link href={backHref} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-accent">
          <Icon name="left" />
          Change time
        </Link>
        <h1 className="text-2xl font-semibold">Confirm your booking</h1>
        {available ? (
          <ConfirmForm
            date={date}
            dayText={`${dayLabel(date, days)}${dayLabel(date, days) === formatDayLabel(date) ? "" : `, ${formatDayLabel(date)}`}`}
            capacity={room.capacity}
            initial={{
              roomId: room.id,
              label: `${room.name}, ${formatTimeRange(zonedTimeToUtc(date, start, tz), zonedTimeToUtc(date, end, tz), tz)}`,
              start,
              end,
            }}
          />
        ) : (
          <div className="flex flex-col items-start gap-4 rounded-xl border border-line bg-surface p-4">
            <p role="alert">This time is no longer available. Choose another time.</p>
            <Link
              href={backHref}
              className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 font-semibold text-accent-ink"
            >
              See open times
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export default function ConfirmPage(props: { params: Promise<{ roomId: string }>; searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PatronLoading />}>
      <Confirm {...props} />
    </Suspense>
  );
}
