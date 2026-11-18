"use client";

import { useEffect, useRef } from "react";
import { BookingActions } from "@/app/_components/BookingActions";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { Icon } from "@/app/_components/Icon";
import { StatusTag } from "@/app/_components/StatusTag";

export function BookingPanel({ booking, onClose }: { booking: BookingSummary; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const rows: [string, string][] = [
    ["Room", booking.roomName],
    ["Time", booking.range],
    ["Library card", `Ends in ${booking.cardLast4}`],
    ["Party", `${booking.partySize} ${booking.partySize === 1 ? "person" : "people"}`],
    ["Booked at", booking.channel],
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby="panel-title"
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-6 text-ink shadow-pop"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="panel-title" className="text-lg font-semibold">
            {booking.patronName}
          </h2>
          <StatusTag status={booking.tag} detail={booking.detail} />
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2"
          aria-label="Close"
        >
          <Icon name="x" />
        </button>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 border-t border-line pt-4">
        <BookingActions booking={booking} onDone={() => ref.current?.close()} />
      </div>
    </dialog>
  );
}
