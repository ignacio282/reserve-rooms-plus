"use client";

import { useId, useRef, useState, useTransition } from "react";
import { cancelBooking, checkInBooking, releaseBooking, type SimpleResult } from "@/app/actions";
import { useBoard } from "@/app/_components/BoardProvider";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { ConfirmDialog } from "@/app/_components/ConfirmDialog";

type Pending = "cancel" | "release" | null;

const button =
  "min-h-8 rounded-md border px-3 text-xs font-semibold disabled:opacity-60 border-line-strong bg-surface text-ink hover:border-accent";
const primary =
  "min-h-8 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60";
const sheetItem =
  "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-60 sm:min-h-9";

/**
 * Booking actions. `layout="row"` shows every action as a button (side panel);
 * `layout="menu"` keeps Check in visible and puts the rest behind "More actions" (agenda cards).
 */
export function BookingActions({
  booking,
  onDone,
  layout = "row",
}: {
  booking: BookingSummary;
  onDone?: () => void;
  layout?: "row" | "menu";
}) {
  const { announce, openMove } = useBoard();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Pending>(null);
  const sheetId = useId();
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { id, patronName, range } = booking;
  const menu = layout === "menu";

  const run = (action: (id: string) => Promise<SimpleResult>, done: (msg: string) => string) =>
    startTransition(async () => {
      const result = await action(id);
      if (result.success) announce(done(result.message));
      else announce(result.error, "error");
      setConfirming(null);
      onDone?.();
    });

  const hasSecondary = booking.canCancel || booking.canRelease || booking.canMove;
  if (!booking.canCheckIn && !hasSecondary) return null;

  // In the menu layout the sheet closes first; dialogs then return focus to "More actions".
  const fromSheet = (next: () => void) => {
    sheetRef.current?.hidePopover();
    next();
  };
  const closeConfirm = () => {
    setConfirming(null);
    if (menu) moreRef.current?.focus();
  };

  const secondary = (
    <>
      {booking.canMove ? (
        <button
          type="button"
          disabled={isPending}
          onClick={menu ? () => fromSheet(() => openMove(booking, moreRef.current)) : (e) => openMove(booking, e.currentTarget)}
          className={menu ? sheetItem : button}
        >
          Move booking
        </button>
      ) : null}
      {booking.canRelease ? (
        <button
          type="button"
          disabled={isPending}
          onClick={menu ? () => fromSheet(() => setConfirming("release")) : () => setConfirming("release")}
          className={menu ? sheetItem : button}
        >
          Release
        </button>
      ) : null}
      {booking.canCancel ? (
        <button
          type="button"
          disabled={isPending}
          onClick={menu ? () => fromSheet(() => setConfirming("cancel")) : () => setConfirming("cancel")}
          className={menu ? sheetItem : button}
        >
          Cancel booking
        </button>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {booking.canCheckIn ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(checkInBooking, () => `Checked in ${patronName}.`)}
          className={primary}
        >
          Check in
        </button>
      ) : null}
      {menu && hasSecondary ? (
        <>
          <button ref={moreRef} type="button" popoverTarget={sheetId} disabled={isPending} className={button}>
            More actions
          </button>
          <div
            ref={sheetRef}
            id={sheetId}
            popover="auto"
            role="group"
            aria-label={`More actions for ${patronName}, ${range}`}
            className="action-sheet"
          >
            <p className="action-sheet-title">
              {patronName} · {range}
            </p>
            {secondary}
          </div>
        </>
      ) : (
        secondary
      )}
      {confirming === "cancel" ? (
        <ConfirmDialog
          title="Cancel this booking?"
          body={`${patronName}, ${range}. The time becomes open for others.`}
          confirmLabel="Cancel booking"
          pending={isPending}
          onConfirm={() => run(cancelBooking, () => `Cancelled ${patronName}'s booking.`)}
          onClose={closeConfirm}
        />
      ) : null}
      {confirming === "release" ? (
        <ConfirmDialog
          title="Release this booking?"
          body={`${patronName}, ${range}. Use this when the patron is not coming; the rest of the time opens up.`}
          confirmLabel="Release room"
          pending={isPending}
          onConfirm={() => run(releaseBooking, (msg) => msg)}
          onClose={closeConfirm}
        />
      ) : null}
    </div>
  );
}
