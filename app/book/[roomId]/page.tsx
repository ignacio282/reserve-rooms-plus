import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  dayLabel,
  param,
  PatronHeader,
  PatronLoading,
  patronContext,
  RoomFacts,
  UUID_RE,
  type SearchParams,
} from "@/app/book/_components/patron";
import { Icon } from "@/app/_components/Icon";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { libraryTimeString } from "@/lib/clock";
import { formatTimeRange } from "@/lib/format";
import { formatLength, lengthOptions, startSlots } from "@/lib/schedule";
import { loadPatronDay } from "@/lib/server/patron";

async function RoomTimes({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ roomId }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(roomId)) notFound();
  const { library, now, today, days } = await patronContext();
  const tz = library.timezone;
  const date = days.includes(param(sp, "date")) ? param(sp, "date") : today;
  const day = await loadPatronDay(library, date, now, date === today);
  const room = day.rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  const busy = day.busyByRoom.get(room.id) ?? [];
  const slots = day.open ? startSlots(day.open, busy, now, tz) : [];
  const anyOpen = slots.some((s) => s.state === "available");
  const chosen = slots.find((s) => s.value === param(sp, "start") && s.state === "available");
  const lengths = chosen && day.open ? lengthOptions(chosen.at, busy, day.open.end, MAX_MINUTES_BY_TYPE[room.type]) : [];
  const nextDay = days[days.indexOf(date) + 1];

  return (
    <>
      <PatronHeader libraryName={library.name} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <Link href="/book" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-accent">
          <Icon name="left" />
          All rooms
        </Link>

        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{room.name}</h1>
          <RoomFacts room={room} />
        </section>

        <section aria-labelledby="day-title" className="flex flex-col gap-2">
          <h2 id="day-title" className="font-semibold">
            1. Choose a day
          </h2>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d) => (
              <li key={d}>
                <Link
                  href={`/book/${room.id}?date=${d}`}
                  aria-current={d === date ? "date" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap ${
                    d === date ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface"
                  }`}
                >
                  {dayLabel(d, days)}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="time-title" className="flex flex-col gap-2">
          <h2 id="time-title" className="font-semibold">
            2. Choose a start time
          </h2>
          {!anyOpen ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <p>No open times on this day. Try another day.</p>
              {nextDay ? (
                <Link
                  href={`/book/${room.id}?date=${nextDay}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 font-medium"
                >
                  {dayLabel(nextDay, days)}
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <li
                  key={s.value}
                  data-live-key={s.state === "past" ? undefined : `slot:${room.id}:${date}:${s.value}`}
                  data-live-version={s.state}
                  className="rounded-lg"
                >
                  {s.state === "available" ? (
                    <Link
                      href={`/book/${room.id}?date=${date}&start=${s.value}#length-title`}
                      aria-current={chosen?.value === s.value ? "true" : undefined}
                      className={`flex min-h-12 items-center justify-center rounded-lg border text-sm font-semibold ${
                        chosen?.value === s.value
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-accent/50 bg-accent-soft text-accent hover:border-accent"
                      }`}
                    >
                      {s.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="flex min-h-12 flex-col items-center justify-center rounded-lg border border-line bg-surface-2 text-xs text-faint"
                    >
                      <span className="line-through">{s.label}</span>
                      <span>{s.state === "past" ? "Past" : "Taken"}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {chosen ? (
          <section aria-labelledby="length-title" className="flex flex-col gap-2">
            <h2 id="length-title" className="font-semibold">
              3. How long?
            </h2>
            <ul className="flex flex-col gap-2">
              {lengths.map((minutes) => {
                const end = new Date(chosen.at.getTime() + minutes * 60_000);
                return (
                  <li key={minutes}>
                    <Link
                      href={`/book/${room.id}/confirm?date=${date}&start=${chosen.value}&end=${libraryTimeString(end, tz)}`}
                      className="flex min-h-12 items-center justify-between rounded-lg border border-line-strong bg-surface px-4 font-medium hover:border-accent"
                    >
                      <span>{formatLength(minutes)}</span>
                      <span className="text-sm text-muted">{formatTimeRange(chosen.at, end, tz)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default function RoomPage(props: { params: Promise<{ roomId: string }>; searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PatronLoading />}>
      <RoomTimes {...props} />
    </Suspense>
  );
}
