import Link from "next/link";
import { Suspense } from "react";
import {
  param,
  PatronHeader,
  PatronLoading,
  patronContext,
  RoomFacts,
  RoomStateLine,
  type SearchParams,
} from "@/app/book/_components/patron";
import { Icon } from "@/app/_components/Icon";
import { loadPatronDay } from "@/lib/server/patron";
import type { RoomType } from "@/types/domain";

const FILTERS: { value: RoomType | ""; label: string }[] = [
  { value: "", label: "All rooms" },
  { value: "study", label: "Study rooms" },
  { value: "meeting", label: "Meeting rooms" },
  { value: "community", label: "Community rooms" },
];

async function RoomList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { library, now, today } = await patronContext();
  const day = await loadPatronDay(library, today, now, true);
  const type = FILTERS.some((f) => f.value === param(sp, "type")) ? param(sp, "type") : "";
  const rooms = type ? day.rooms.filter((r) => r.type === type) : day.rooms;

  return (
    <>
      <PatronHeader libraryName={library.name} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold">Book a room</h1>
          <p className="mt-1 text-muted">Pick a room to see its open times. No account needed.</p>
        </div>

        <nav aria-label="Room type" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {FILTERS.map((f) => (
              <li key={f.label}>
                <Link
                  href={f.value ? `/book?type=${f.value}` : "/book"}
                  aria-current={type === f.value ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap ${
                    type === f.value ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface"
                  }`}
                >
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {rooms.length === 0 ? (
          <p className="text-muted">No rooms of this type.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rooms.map((room) => {
              const state = day.stateByRoom.get(room.id);
              return (
                <li
                  key={room.id}
                  data-live-key={`room:${room.id}`}
                  data-live-version={JSON.stringify(state ?? null)}
                  className="rounded-xl"
                >
                  <Link
                    href={`/book/${room.id}`}
                    className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-accent"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <h2 className="text-lg font-semibold">{room.name}</h2>
                      <RoomFacts room={room} />
                      {state ? <RoomStateLine state={state} timeZone={library.timezone} /> : null}
                    </div>
                    <Icon name="right" className="size-5 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

export default function BookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PatronLoading />}>
      <RoomList searchParams={searchParams} />
    </Suspense>
  );
}
