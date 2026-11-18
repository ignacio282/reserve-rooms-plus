import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PatronHeader, PatronLoading, patronContext, TYPE_LABEL, UUID_RE } from "@/app/book/_components/patron";
import { Icon } from "@/app/_components/Icon";
import { checkInWindow, deriveStatus } from "@/lib/booking-rules";
import { libraryDateString } from "@/lib/clock";
import { formatDayLabel, formatTimeRange } from "@/lib/format";
import { loadRoom, settingsOf, toBoardBooking } from "@/lib/server/board";
import { loadBookingById } from "@/lib/server/patron";

const INACTIVE: Record<string, string> = {
  cancelled: "This booking was cancelled.",
  released: "This booking was released because nobody checked in.",
  completed: "This booking has ended.",
};

async function Done({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) notFound();
  const { library, now } = await patronContext();
  const row = await loadBookingById(bookingId);
  if (!row) notFound();
  const room = await loadRoom(row.room_id);
  if (!room) notFound();

  const tz = library.timezone;
  const booking = toBoardBooking(row);
  const settings = settingsOf(library);
  const status = deriveStatus(booking, settings, now);
  const { opensAt, closesAt } = checkInWindow(booking, settings);
  const windowText = formatTimeRange(opensAt, closesAt, tz).replace("-", " and ");
  const active = status === "booked" || status === "checked_in";

  return (
    <>
      <PatronHeader libraryName={library.name} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        {active ? (
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink">
              <Icon name="check" className="size-5" />
            </span>
            <h1 className="text-2xl font-semibold">{status === "checked_in" ? "You are checked in" : "Your room is booked"}</h1>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Your booking</h1>
            <p role="status" className="rounded-xl border border-line bg-surface-2 p-4 font-medium">
              {INACTIVE[status] ?? "This booking is no longer active."}
            </p>
          </>
        )}

        <section aria-label="Booking details" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <p className="text-lg font-semibold">{room.name}</p>
            <p className="text-sm text-muted">
              {TYPE_LABEL[room.type]} · {room.location_in_building}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">When</p>
            <p className="font-semibold">
              {formatDayLabel(libraryDateString(booking.startAt, tz))}, {formatTimeRange(booking.startAt, booking.endAt, tz)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Booking code</p>
            <p className="font-mono text-4xl font-semibold tracking-[0.2em]" aria-label={row.booking_code.split("").join(" ")}>
              {row.booking_code}
            </p>
            <p className="mt-1 text-sm text-muted">Keep this code. You will use it to check in.</p>
          </div>
        </section>

        {status === "booked" ? (
          <section aria-labelledby="checkin-title" className="flex flex-col gap-3 rounded-xl border border-booked-edge bg-booked-bg p-5 text-ink">
            <h2 id="checkin-title" className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="clock" className="size-5" />
              Check in when you arrive
            </h2>
            <p className="font-semibold">Check in between {windowText} or the room is released.</p>
            <ol className="ml-5 flex list-decimal flex-col gap-1.5">
              <li>Go to {room.name} ({room.location_in_building}).</li>
              <li>Scan the code on the room&apos;s door display with your phone camera.</li>
              <li>Enter your booking code or the last 4 digits of your library card.</li>
            </ol>
            <p>No phone? Ask at the front desk and staff will check you in.</p>
          </section>
        ) : null}

        <Link
          href="/book"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-surface px-5 font-semibold hover:border-accent"
        >
          Book another room
        </Link>
      </main>
    </>
  );
}

export default function DonePage(props: { params: Promise<{ bookingId: string }> }) {
  return (
    <Suspense fallback={<PatronLoading />}>
      <Done {...props} />
    </Suspense>
  );
}
