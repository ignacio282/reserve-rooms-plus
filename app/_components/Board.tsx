import Link from "next/link";
import { connection } from "next/server";
import { AllRoomsGrid } from "@/app/_components/AllRoomsGrid";
import { BoardProvider } from "@/app/_components/BoardProvider";
import { summarize, type BookingSummary } from "@/app/_components/booking-summary";
import { BookingSearch } from "@/app/_components/BookingSearch";
import { OpenPanelButton } from "@/app/_components/OpenPanelButton";
import { Icon } from "@/app/_components/Icon";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import { RoomAgenda } from "@/app/_components/RoomAgenda";
import { TimeControl } from "@/app/_components/TimeControl";
import { isValidDate } from "@/lib/booking-input";
import { libraryDateString, libraryDayBounds, libraryTimeString, zonedTimeToUtc } from "@/lib/clock";
import { formatDayLabel, formatTime } from "@/lib/format";
import { deriveStatus } from "@/lib/booking-rules";
import {
  activeIntervals,
  availableNow,
  freeSlots,
  matchesBookingQuery,
  openingHoursFor,
  roomStateAt,
  type RoomState,
} from "@/lib/schedule";
import { loadBookingsStartingBetween, loadRooms, settingsOf, toBoardBooking, type BoardBooking } from "@/lib/server/board";
import { ensureTodaySeeded, getLibraryContext, releaseOverdue } from "@/lib/server/library";
import type { RoomRow, RoomType } from "@/types/domain";

type SearchParams = Record<string, string | string[] | undefined>;

const TYPE_ORDER: RoomType[] = ["study", "meeting", "community"];
const TYPE_GROUP: Record<RoomType, string> = { study: "Study rooms", meeting: "Meeting rooms", community: "Community rooms" };

function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const STATE_COLOR: Record<RoomState["kind"], { text: string; dot: string }> = {
  free: { text: "text-accent", dot: "bg-accent" },
  in_use: { text: "text-checked", dot: "bg-checked-edge" },
  awaiting_check_in: { text: "text-booked", dot: "bg-booked-edge" },
  closed: { text: "text-muted", dot: "bg-line-strong" },
};

function stateLabel(state: RoomState, timeZone: string): string {
  switch (state.kind) {
    case "free":
      return `Free until ${formatTime(state.until, timeZone)}`;
    case "in_use":
      return `In use until ${formatTime(state.until, timeZone)}`;
    case "awaiting_check_in":
      return `Awaiting check-in until ${formatTime(state.closesAt, timeZone)}`;
    case "closed":
      return "Closed";
  }
}

export async function Board({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  await ensureTodaySeeded();
  await releaseOverdue();
  const { library, now } = await getLibraryContext();
  const tz = library.timezone;
  const settings = settingsOf(library);

  const today = libraryDateString(now, tz);
  const requested = param(sp, "date");
  const date = isValidDate(requested) ? requested : today;
  const view = param(sp, "view") === "all" ? "all" : "room";
  const isToday = date === today;
  const isPast = date < today;

  const bounds = libraryDayBounds(zonedTimeToUtc(date, "12:00", tz), tz);
  const [roomRows, bookingRows] = await Promise.all([loadRooms(), loadBookingsStartingBetween(bounds.start, bounds.end)]);
  const rooms: RoomRow[] = [...roomRows].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name),
  );
  const selected = rooms.find((r) => r.id === param(sp, "room")) ?? rooms[0];
  const open = openingHoursFor(date, library.opening_hours, tz);

  const bookingsByRoom = new Map<string, BoardBooking[]>(rooms.map((r) => [r.id, []]));
  for (const row of bookingRows) bookingsByRoom.get(row.room_id)?.push(toBoardBooking(row));

  const states = new Map<string, RoomState>();
  if (isToday) for (const r of rooms) states.set(r.id, roomStateAt(now, bookingsByRoom.get(r.id) ?? [], settings, open));
  const available = isToday ? availableNow(rooms, states) : [];

  const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
  const summaries = new Map<string, BookingSummary>();
  for (const list of bookingsByRoom.values()) {
    for (const b of list) summaries.set(b.id, summarize(b, roomNames.get(b.roomId) ?? "", settings, now, tz, isPast));
  }
  const query = param(sp, "q").trim().slice(0, 80);
  const shownOnGrid = [...bookingsByRoom.values()]
    .flat()
    .filter((b) => ["booked", "checked_in", "completed"].includes(deriveStatus(b, settings, now)))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const matched = query ? shownOnGrid.filter((b) => matchesBookingQuery(b, query)) : [];
  const matches = query ? new Set(matched.map((b) => b.id)) : null;

  const selectedBookings = bookingsByRoom.get(selected.id) ?? [];
  const selectedFree = open && !isPast ? freeSlots(open, activeIntervals(selectedBookings, settings, now), now) : [];

  const href = (p: { date?: string; view?: string; room?: string }) => {
    const q = new URLSearchParams();
    const d = p.date ?? date;
    if (d !== today) q.set("date", d);
    q.set("view", p.view ?? view);
    q.set("room", p.room ?? selected.id);
    return `/?${q.toString()}`;
  };
  const todayHref = `/?view=${view}&room=${selected.id}`;

  return (
    <BoardProvider
      info={{
        date,
        isToday,
        timeZone: tz,
        openISO: open?.start.toISOString() ?? null,
        closeISO: open?.end.toISOString() ?? null,
        nowISO: now.toISOString(),
        selectedRoomId: selected.id,
        rooms: rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, capacity: r.capacity })),
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <p className="font-semibold">
            {library.name} <span className="font-normal text-muted">· Reserve Rooms+</span>
          </p>
          <LiveIndicator />
        </div>
        <TimeControl
          nowLabel={`${formatDayLabel(today)} - ${formatTime(now, tz)}`}
          nowDate={today}
          nowTime={libraryTimeString(now, tz)}
          todayHref={todayHref}
        />
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl font-semibold">Rooms</h1>
            <nav aria-label="Day" className="flex items-center gap-1">
              <Link
                href={href({ date: shiftDate(date, -1) })}
                aria-label="Previous day"
                className="grid size-9 place-items-center rounded-md border border-line-strong bg-surface hover:border-accent"
              >
                <Icon name="left" />
              </Link>
              <span className="min-w-28 text-center text-sm font-semibold" aria-live="polite">
                {isToday ? `Today, ${formatDayLabel(date)}` : formatDayLabel(date)}
              </span>
              <Link
                href={href({ date: shiftDate(date, 1) })}
                aria-label="Next day"
                className="grid size-9 place-items-center rounded-md border border-line-strong bg-surface hover:border-accent"
              >
                <Icon name="right" />
              </Link>
              {!isToday ? (
                <Link href={href({ date: today })} className="ml-2 text-sm font-medium text-accent underline-offset-2 hover:underline">
                  Today
                </Link>
              ) : null}
            </nav>
          </div>
          <nav aria-label="View" className="flex rounded-lg border border-line-strong bg-surface p-0.5">
            {(["room", "all"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                aria-current={view === v ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${
                  view === v ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={v === "room" ? "list" : "grid"} />
                {v === "room" ? "By room" : "All rooms"}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface p-5">
            {view === "room" ? (
              <div className="flex flex-col gap-6 md:flex-row">
                <nav aria-label="Rooms" className="flex shrink-0 flex-col md:w-72 md:border-r md:border-line md:pr-6">
                  {TYPE_ORDER.map((type) => {
                    const group = rooms.filter((r) => r.type === type);
                    if (group.length === 0) return null;
                    return (
                      <div key={type} className="border-b border-line py-4 first:pt-0 last:border-b-0">
                        <h2 className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted uppercase">{TYPE_GROUP[type]}</h2>
                        <ul className="flex flex-col gap-1">
                          {group.map((r) => {
                            const state = states.get(r.id);
                            const current = r.id === selected.id;
                            return (
                              <li key={r.id}>
                                <Link
                                  href={href({ room: r.id })}
                                  aria-current={current ? "page" : undefined}
                                  className={`flex flex-col gap-1 rounded-md px-3 py-2.5 ${
                                    current ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-surface-2"
                                  }`}
                                >
                                  <span className="font-medium">{r.name}</span>
                                  {state ? (
                                    <span className={`flex items-center gap-2 text-sm font-medium ${STATE_COLOR[state.kind].text}`}>
                                      <span
                                        aria-hidden="true"
                                        className={`size-2 shrink-0 rounded-full ${STATE_COLOR[state.kind].dot}`}
                                      />
                                      {stateLabel(state, tz)}
                                    </span>
                                  ) : null}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </nav>
                <RoomAgenda
                  room={selected}
                  open={open}
                  bookings={selectedBookings}
                  freeSlots={selectedFree}
                  settings={settings}
                  now={now}
                  timeZone={tz}
                  isToday={isToday}
                  isPast={isPast}
                  summaries={summaries}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <BookingSearch
                    key={query}
                    initialQuery={query}
                    baseHref={`/?${date !== today ? `date=${date}&` : ""}view=all&room=${selected.id}`}
                  />
                  {query ? (
                    <div aria-live="polite" className="flex flex-col gap-1.5">
                      <p className="text-sm text-muted">
                        {matched.length === 0
                          ? "No bookings match."
                          : `${matched.length} ${matched.length === 1 ? "match" : "matches"}`}
                      </p>
                      {matched.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {matched.map((b) => {
                            const summary = summaries.get(b.id)!;
                            const text = `${b.patronName} · ${summary.roomName} · ${summary.range}`;
                            return (
                              <li key={b.id}>
                                <OpenPanelButton
                                  booking={summary}
                                  label={`${text}. Open booking`}
                                  className="min-h-9 rounded-md border border-accent bg-accent-soft px-3 text-sm font-medium text-accent hover:bg-surface"
                                >
                                  {text}
                                </OpenPanelButton>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              <AllRoomsGrid
                rooms={rooms}
                bookingsByRoom={bookingsByRoom}
                open={open}
                settings={settings}
                now={now}
                timeZone={tz}
                isToday={isToday}
                roomHref={(roomId) => href({ view: "room", room: roomId })}
                summaries={summaries}
                matches={matches}
              />
              </div>
            )}
          </div>

          {isToday ? (
            <aside aria-labelledby="available-title" className="rounded-xl border border-line bg-surface p-5 lg:w-72">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="available-title" className="font-semibold">
                  Available now
                </h2>
                <span className="text-xs text-muted">
                  {available.length} {available.length === 1 ? "room" : "rooms"}
                </span>
              </div>
              {available.length === 0 ? (
                <p className="text-sm text-muted">No rooms are free right now.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {available.map(({ room, freeUntil }) => (
                    <li
                      key={room.id}
                      data-live-key={`avail:${room.id}`}
                      data-live-version={freeUntil.toISOString()}
                      className="flex items-center justify-between gap-3 rounded-md"
                    >
                      <div>
                        <p className="text-sm font-medium">{room.name}</p>
                        <p className="text-xs text-muted">
                          Up to {room.capacity} · free until {formatTime(freeUntil, tz)}
                        </p>
                      </div>
                      <Link
                        href={href({ view: "room", room: room.id })}
                        aria-label={`Book ${room.name}`}
                        className="inline-flex min-h-9 items-center rounded-md border border-line-strong px-3 text-sm font-medium hover:border-accent"
                      >
                        Book
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          ) : null}
        </div>
      </main>
    </BoardProvider>
  );
}
