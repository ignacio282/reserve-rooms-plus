import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PatronHeader, PatronLoading, patronContext, TYPE_LABEL, UUID_RE } from "@/app/book/_components/patron";
import { Icon } from "@/app/_components/Icon";
import { CheckInForm } from "@/app/book/_components/CheckInForm";
import { checkInWindow, deriveStatus } from "@/lib/booking-rules";
import { libraryDateString } from "@/lib/clock";
import { formatDayLabel, formatTime, formatTimeRange } from "@/lib/format";
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
            <p className="mt-1 text-sm text-muted">Keep this code. You can use it to check in at the door if you close this page.</p>
          </div>
        </section>

        {active ? (
          <section
            aria-labelledby="checkin-title"
            className={`flex flex-col gap-3 rounded-xl border p-5 text-ink ${status === "booked" ? "border-booked-edge bg-booked-bg" : "border-checked-edge bg-surface"}`}
          >
            <h2 id="checkin-title" className="flex items-center gap-2 text-lg font-semibold">
              <Icon name={status === "booked" ? "clock" : "check"} className="size-5" />
              {status === "booked" ? "Check in when you arrive" : "Checked in"}
            </h2>
            {status === "booked" ? (
              <>
                <p className="font-semibold">Check in between {windowText} or the room is released.</p>
                <ol className="ml-5 flex list-decimal flex-col gap-1.5">
                  <li>Go to {room.name} ({room.location_in_building}).</li>
                  <li>Enter the 6-digit code shown on the room&apos;s door display below.</li>
                </ol>
                <p className="text-sm">Keep this page open or bookmark it so you can check in from here.</p>
              </>
            ) : null}
            <CheckInForm
              bookingId={row.id}
              checkedIn={status === "checked_in"}
              checkedInText={`You are checked in. The room is yours until ${formatTime(booking.endAt, tz)}.`}
            />
            {status === "booked" ? (
              <p className="text-sm">
                Closed this page? Scan the QR code on the door display with your phone camera and enter your booking code.
                No phone? Ask at the front desk and staff will check you in.
              </p>
            ) : null}
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
