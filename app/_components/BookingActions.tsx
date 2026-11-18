"use client";

import { useState, useTransition } from "react";
import { cancelBooking, checkInBooking, releaseBooking, type SimpleResult } from "@/app/actions";
import { useBoard } from "@/app/_components/BoardProvider";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { ConfirmDialog } from "@/app/_components/ConfirmDialog";

type Pending = "cancel" | "release" | null;

const button =
  "min-h-8 rounded-md border px-3 text-xs font-semibold disabled:opacity-60 border-line-strong bg-surface text-ink hover:border-accent";

export function BookingActions({ booking, onDone }: { booking: BookingSummary; onDone?: () => void }) {
  const { announce, openMove } = useBoard();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Pending>(null);
  const { id, patronName, range } = booking;

  const run = (action: (id: string) => Promise<SimpleResult>, done: (msg: string) => string) =>
    startTransition(async () => {
      const result = await action(id);
      if (result.success) announce(done(result.message));
      else announce(result.error, "error");
      setConfirming(null);
      onDone?.();
    });

  if (!booking.canCheckIn && !booking.canCancel && !booking.canRelease && !booking.canMove) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {booking.canCheckIn ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(checkInBooking, () => `Checked in ${patronName}.`)}
          className="min-h-8 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
        >
          Check in
        </button>
      ) : null}
      {booking.canMove ? (
        <button type="button" disabled={isPending} onClick={(e) => openMove(booking, e.currentTarget)} className={button}>
          Move booking
        </button>
      ) : null}
      {booking.canRelease ? (
        <button type="button" disabled={isPending} onClick={() => setConfirming("release")} className={button}>
          Release
        </button>
      ) : null}
      {booking.canCancel ? (
        <button type="button" disabled={isPending} onClick={() => setConfirming("cancel")} className={button}>
          Cancel
        </button>
      ) : null}
      {confirming === "cancel" ? (
        <ConfirmDialog
          title="Cancel this booking?"
          body={`${patronName}, ${range}. The time becomes open for others.`}
          confirmLabel="Cancel booking"
          pending={isPending}
          onConfirm={() => run(cancelBooking, () => `Cancelled ${patronName}'s booking.`)}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      {confirming === "release" ? (
        <ConfirmDialog
          title="Release this booking?"
          body={`${patronName}, ${range}. Use this when the patron is not coming; the rest of the time opens up.`}
          confirmLabel="Release room"
          pending={isPending}
          onConfirm={() => run(releaseBooking, (msg) => msg)}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
