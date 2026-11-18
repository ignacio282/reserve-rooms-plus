import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/app/_components/Icon";
import { roomStatusText } from "@/app/_components/room-status";
import { patronContext } from "@/app/book/_components/patron";
import { DoorCode } from "@/app/door/_components/DoorCode";
import { roomCheckInView } from "@/lib/checkin";
import { libraryDateString } from "@/lib/clock";
import { openingHoursFor } from "@/lib/schedule";
import { settingsOf } from "@/lib/server/board";
import { doorCode, loadRoomByToken, loadRoomDay, requestOrigin } from "@/lib/server/checkin";

export const metadata: Metadata = { title: "Door display - Reserve Rooms+" };

async function Door({ params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const { library, now } = await patronContext();
  const room = await loadRoomByToken(roomToken);
  if (!room) notFound();
  const tz = library.timezone;
  const [bookings, code] = await Promise.all([loadRoomDay(room, library, now), doorCode(room, await requestOrigin())]);
  const open = openingHoursFor(libraryDateString(now, tz), library.opening_hours, tz);
  const status = roomStatusText(roomCheckInView(now, bookings, settingsOf(library), open), tz);

  return (
    <main className="flex min-h-screen flex-col gap-8 px-6 py-8 sm:px-12 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-5xl font-semibold sm:text-6xl">{room.name}</h1>
        <p className="text-xl text-muted">
          {library.name} · {room.location_in_building}
        </p>
      </header>

      <section aria-label="Room status" className={`flex flex-col gap-2 rounded-2xl border-2 p-6 ${status.tone}`}>
        <p data-testid="door-status" className="flex items-center gap-3 text-3xl font-semibold sm:text-4xl">
          <Icon name={status.icon} className="size-9" />
          {status.headline}
        </p>
        {status.detail ? <p className="text-xl text-ink">{status.detail}</p> : null}
      </section>

      <section aria-label="Check in" className="flex flex-1 flex-col items-center justify-center gap-6">
        <DoorCode roomToken={room.qr_token} initial={code} />
        <p className="max-w-2xl text-center text-xl">
          To check in, scan the QR code with your phone camera, or type the code on your booking page. No phone? Ask at the
          front desk.
        </p>
      </section>
    </main>
  );
}

export default function DoorPage(props: { params: Promise<{ roomToken: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="px-6 py-8">
          <p role="status" className="text-xl text-muted">
            Loading...
          </p>
        </main>
      }
    >
      <Door {...props} />
    </Suspense>
  );
}
