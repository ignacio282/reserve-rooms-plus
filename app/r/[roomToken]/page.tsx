import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/app/_components/Icon";
import { roomStatusText } from "@/app/_components/room-status";
import { param, PatronHeader, PatronLoading, patronContext, TYPE_LABEL, type SearchParams } from "@/app/book/_components/patron";
import { RoomCheckIn } from "@/app/r/_components/RoomCheckIn";
import { MAX_MINUTES_BY_TYPE } from "@/lib/booking-input";
import { roomCheckInView, walkInEnd } from "@/lib/checkin";
import { formatTime } from "@/lib/format";
import { openingHoursFor } from "@/lib/schedule";
import { settingsOf } from "@/lib/server/board";
import { loadRoomByToken, loadRoomDay } from "@/lib/server/checkin";

export const metadata: Metadata = { title: "Check in - Reserve Rooms+" };

type Props = { params: Promise<{ roomToken: string }>; searchParams: Promise<SearchParams> };

async function RoomPage({ params, searchParams }: Props) {
  const [{ roomToken }, sp] = await Promise.all([params, searchParams]);
  const { library, now, today } = await patronContext();
  const room = await loadRoomByToken(roomToken);
  if (!room) notFound();
  const tz = library.timezone;
  const bookings = await loadRoomDay(room, library, now);
  const view = roomCheckInView(now, bookings, settingsOf(library), openingHoursFor(today, library.opening_hours, tz));
  const status = roomStatusText(view, tz);
  // The code in the link is only prefilled; it is checked (and counted) on submit.
  const rawCode = param(sp, "code");
  const code = /^[\d -]{1,7}$/.test(rawCode) ? rawCode : "";
  const walkInUntil =
    view.state.kind === "free" ? formatTime(walkInEnd(now, view.state.until, MAX_MINUTES_BY_TYPE[room.type]), tz) : null;

  return (
    <>
      <PatronHeader libraryName={library.name} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold">{room.name}</h1>
          <p className="text-sm text-muted">
            {TYPE_LABEL[room.type]} · {room.location_in_building}
          </p>
        </div>

        <section
          aria-label="Room status"
          data-live-key={`room-status:${room.id}`}
          data-live-version={`${status.headline}|${status.detail ?? ""}`}
          className={`flex flex-col gap-1 rounded-xl border-2 p-4 ${status.tone}`}>
          <p data-testid="room-status" className="flex items-center gap-2 text-lg font-semibold">
            <Icon name={status.icon} className="size-5" />
            {status.headline}
          </p>
          {status.detail ? <p className="text-ink">{status.detail}</p> : null}
        </section>

        {code ? null : (
          <p className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-4 font-medium">
            <Icon name="key" className="size-5" />
            Scan the code on the room&apos;s door display, or type the code shown there.
          </p>
        )}

        <RoomCheckIn roomToken={room.qr_token} initialCode={code} walkInUntil={walkInUntil} capacity={room.capacity} />

        <p className="text-sm text-muted">No phone or need help? Ask at the front desk and staff will check you in.</p>
      </main>
    </>
  );
}

export default function RoomCheckInPage(props: Props) {
  return (
    <Suspense fallback={<PatronLoading />}>
      <RoomPage {...props} />
    </Suspense>
  );
}
