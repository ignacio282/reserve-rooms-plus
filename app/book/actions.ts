"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  NEED_ROOM_CODE,
  outcomeMessage,
  PAUSED_BOOKING,
  UNEXPECTED,
  WRONG_CODE,
  type CheckInResult,
} from "@/app/_components/checkin-messages";
import { isValidDate, validateDeskBooking } from "@/lib/booking-input";
import { bookingCheckInOutcome, isPaused } from "@/lib/checkin";
import { libraryDateString } from "@/lib/clock";
import { formatTimeRange } from "@/lib/format";
import { bookingDays } from "@/lib/schedule";
import { alternativesFor, type AlternativeOption } from "@/lib/server/alternatives";
import { loadRoom, settingsOf, toBoardBooking } from "@/lib/server/board";
import { recentFailures, recordFailure } from "@/lib/server/checkin";
import { isValidCheckinCode } from "@/lib/server/checkin-code";
import { loadBookingById } from "@/lib/server/patron";
import { getLibraryContext } from "@/lib/server/library";
import { announceChange } from "@/lib/server/live";
import { supabaseAdmin } from "@/lib/server/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WebBookingState = {
  success: false;
  error: string;
  fieldErrors?: Record<string, string>;
  conflict?: { label: string; alternatives: AlternativeOption[] };
} | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createWebBooking(_prev: WebBookingState, formData: FormData): Promise<WebBookingState> {
  let bookingId: string;
  try {
    const roomId = field(formData, "roomId");
    const date = field(formData, "date");
    if (!UUID_RE.test(roomId)) return { success: false, error: "This time is no longer available. Choose another time." };
    const [ctx, room] = await Promise.all([getLibraryContext(), loadRoom(roomId)]);
    if (!room) return { success: false, error: "This room is not available. Choose another room." };
    const tz = ctx.library.timezone;
    const days = bookingDays(libraryDateString(ctx.now, tz), 7);
    if (!isValidDate(date) || !days.includes(date)) {
      return { success: false, error: "You can book today and the next 6 days. Choose another time." };
    }

    const checked = validateDeskBooking(
      {
        date,
        start: field(formData, "start"),
        end: field(formData, "end"),
        patronName: field(formData, "patronName"),
        cardLast4: field(formData, "cardLast4"),
        partySize: field(formData, "partySize"),
      },
      { room, openingHours: ctx.library.opening_hours, timeZone: tz, now: ctx.now },
    );
    if (!checked.ok) {
      const { start, end, ...personal } = checked.fieldErrors;
      if (start || end) return { success: false, error: start ?? end ?? "Choose another time." };
      return { success: false, error: "Check the highlighted fields.", fieldErrors: personal };
    }

    const v = checked.value;
    const { data, error } = await supabaseAdmin().rpc("create_booking", {
      p_room_id: room.id,
      p_start: v.start.toISOString(),
      p_end: v.end.toISOString(),
      p_patron_name: v.patronName,
      p_card_last4: v.cardLast4,
      p_party_size: v.partySize,
      p_channel: "web",
      p_created_by: "patron",
    });
    if (error) throw new Error(`create_booking failed: ${error.message}`);
    const result = data as { ok: true; id: string } | { ok: false };
    if (!result.ok) {
      return {
        success: false,
        error: "Sorry, someone just booked this time.",
        conflict: {
          label: `${room.name} is no longer free ${formatTimeRange(v.start, v.end, tz)}.`,
          alternatives: await alternativesFor(room.id, date, v.start, v.end, v.partySize),
        },
      };
    }
    bookingId = result.id;
    announceChange();
  } catch (error) {
    console.error(error);
    return { success: false, error: "Something went wrong. Try again." };
  }
  redirect(`/book/done/${bookingId}`);
}

/** Check-in from the booking page: the booking link identifies the booking, so only the room code is asked for. */
export async function checkInFromBookingPage(_prev: CheckInResult, formData: FormData): Promise<CheckInResult> {
  try {
    const bookingId = field(formData, "bookingId");
    const code = field(formData, "code").trim();
    if (!UUID_RE.test(bookingId)) return { success: false, kind: "state", error: "This booking was not found." };
    if (!code) return { success: false, kind: "invalid", error: NEED_ROOM_CODE };
    const [ctx, row] = await Promise.all([getLibraryContext(), loadBookingById(bookingId)]);
    if (!row) return { success: false, kind: "state", error: "This booking was not found." };
    const tz = ctx.library.timezone;
    const settings = settingsOf(ctx.library);

    // Window and status come first: they reveal nothing about the code and use no attempts.
    const blocked = outcomeMessage(bookingCheckInOutcome(toBoardBooking(row), settings, ctx.now), tz);
    if (blocked) {
      refresh();
      return { success: false, kind: "state", error: blocked };
    }
    if (isPaused(await recentFailures("booking", row.id))) return { success: false, kind: "paused", error: PAUSED_BOOKING };
    if (!isValidCheckinCode(row.room_id, code)) {
      const failures = await recordFailure("booking", row.id);
      return isPaused(failures)
        ? { success: false, kind: "paused", error: PAUSED_BOOKING }
        : { success: false, kind: "wrong_code", error: WRONG_CODE };
    }

    const { data, error } = await supabaseAdmin().rpc("apply_booking_action", {
      p_booking_id: row.id,
      p_action: "check_in",
      p_actor: "patron",
    });
    if (error) throw new Error(`apply_booking_action failed: ${error.message}`);
    refresh();
    if (data !== true) {
      // The booking changed between reading and checking in (window closed, staff action).
      const [latestCtx, latest] = await Promise.all([getLibraryContext(), loadBookingById(row.id)]);
      const message = latest
        ? outcomeMessage(bookingCheckInOutcome(toBoardBooking(latest), settings, latestCtx.now), tz)
        : null;
      return { success: false, kind: "state", error: message ?? "This booking changed. Try again." };
    }
    announceChange();
    return { success: true, message: "You are checked in." };
  } catch (error) {
    console.error(error);
    return { success: false, kind: "unexpected", error: UNEXPECTED };
  }
}
