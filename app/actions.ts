"use server";

import { refresh } from "next/cache";
import { deriveStatus } from "@/lib/booking-rules";
import { isValidDate, isValidTime, validateDeskBooking, validateMove } from "@/lib/booking-input";
import { libraryDateString, libraryTimeString, zonedTimeToUtc } from "@/lib/clock";
import { formatTimeRange } from "@/lib/format";
import { activeIntervals, findAlternatives, openingHoursFor, type Interval } from "@/lib/schedule";
import { loadBookingsStartingBetween, loadRoom, loadRooms, settingsOf, toBoardBooking } from "@/lib/server/board";
import { currentCheckinCode } from "@/lib/server/checkin-code";
import { getLibraryContext, startOver } from "@/lib/server/library";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { BookingRow } from "@/types/domain";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNEXPECTED = "Something went wrong. Try again.";
const GONE = "This booking no longer exists. The board has been refreshed.";

export interface AlternativeOption {
  roomId: string;
  roomName: string;
  start: string;
  end: string;
  label: string;
}

export type ActionFailure = {
  success: false;
  error: string;
  fieldErrors?: Record<string, string>;
  conflict?: { label: string; alternatives: AlternativeOption[] };
};

export type BookingFormState = { success: true; bookingId: string; roomId: string; message: string } | ActionFailure | null;
export type SimpleResult = { success: true; message: string } | ActionFailure;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failUnexpected(error: unknown): ActionFailure {
  console.error(error);
  return { success: false, error: UNEXPECTED };
}

async function alternativesFor(
  roomId: string,
  date: string,
  start: Date,
  end: Date,
  partySize: number,
): Promise<AlternativeOption[]> {
  const ctx = await getLibraryContext();
  const { timezone: tz } = ctx.library;
  const open = openingHoursFor(date, ctx.library.opening_hours, tz);
  if (!open) return [];
  const [rooms, rows] = await Promise.all([loadRooms(), loadBookingsStartingBetween(open.start, open.end)]);
  const settings = settingsOf(ctx.library);
  const busyByRoom = new Map<string, Interval[]>();
  for (const room of rooms) {
    const mine = rows.filter((r) => r.room_id === room.id).map(toBoardBooking);
    busyByRoom.set(room.id, activeIntervals(mine, settings, ctx.now));
  }
  const { sameRoom, otherRooms } = findAlternatives({ roomId, start, end, partySize, rooms, busyByRoom, open });
  return [...sameRoom, ...otherRooms].map((a) => ({
    roomId: a.roomId,
    roomName: a.roomName,
    start: libraryTimeString(a.start, tz),
    end: libraryTimeString(a.end, tz),
    label: `${a.roomName}, ${formatTimeRange(a.start, a.end, tz)}`,
  }));
}

export async function createDeskBooking(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  try {
    const roomId = field(formData, "roomId");
    if (!UUID_RE.test(roomId)) return { success: false, error: "Choose a room." };
    const [ctx, room] = await Promise.all([getLibraryContext(), loadRoom(roomId)]);
    if (!room) return { success: false, error: "That room is not available." };
    const tz = ctx.library.timezone;
    const date = field(formData, "date");

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
    if (!checked.ok) return { success: false, error: "Check the highlighted fields.", fieldErrors: checked.fieldErrors };

    const v = checked.value;
    const { data, error } = await supabaseAdmin().rpc("create_booking", {
      p_room_id: room.id,
      p_start: v.start.toISOString(),
      p_end: v.end.toISOString(),
      p_patron_name: v.patronName,
      p_card_last4: v.cardLast4,
      p_party_size: v.partySize,
      p_channel: "desk",
      p_created_by: "staff",
    });
    if (error) throw new Error(`create_booking failed: ${error.message}`);

    const result = data as { ok: true; id: string } | { ok: false; conflict: { start_at: string; end_at: string } };
    refresh();
    if (result.ok) {
      return {
        success: true,
        bookingId: result.id,
        roomId: room.id,
        message: `Booked ${room.name}, ${formatTimeRange(v.start, v.end, tz)}, for ${v.patronName}.`,
      };
    }
    const label = `This room is taken ${formatTimeRange(new Date(result.conflict.start_at), new Date(result.conflict.end_at), tz)}`;
    return {
      success: false,
      error: label,
      conflict: { label, alternatives: await alternativesFor(room.id, date, v.start, v.end, v.partySize) },
    };
  } catch (error) {
    return failUnexpected(error);
  }
}

const ACTION_DONE: Record<string, string> = {
  check_in: "Checked in.",
  cancel: "Booking cancelled.",
  release: "Booking released. The time is open again.",
};

async function bookingAction(id: string, action: "check_in" | "cancel" | "release"): Promise<SimpleResult> {
  try {
    if (!UUID_RE.test(id)) return { success: false, error: "That booking was not found." };
    const { data, error } = await supabaseAdmin().rpc("apply_booking_action", {
      p_booking_id: id,
      p_action: action,
      p_actor: "staff",
    });
    if (error) throw new Error(`apply_booking_action failed: ${error.message}`);
    refresh();
    if (data !== true) return { success: false, error: "This booking changed. The board has been refreshed." };
    return { success: true, message: ACTION_DONE[action] };
  } catch (error) {
    return failUnexpected(error);
  }
}

export async function checkInBooking(id: string): Promise<SimpleResult> {
  return bookingAction(id, "check_in");
}

export async function cancelBooking(id: string): Promise<SimpleResult> {
  return bookingAction(id, "cancel");
}

export async function releaseBooking(id: string): Promise<SimpleResult> {
  return bookingAction(id, "release");
}

export async function getRoomCheckinCode(
  roomId: string,
): Promise<{ success: true; code: string; msUntilNext: number } | ActionFailure> {
  try {
    if (!UUID_RE.test(roomId) || !(await loadRoom(roomId))) return { success: false, error: "That room was not found." };
    return { success: true, ...currentCheckinCode(roomId) };
  } catch (error) {
    return failUnexpected(error);
  }
}

async function runClockChange(change: () => Promise<{ error: { message: string } | null }>, message: string) {
  try {
    const { error } = await change();
    if (error) throw new Error(error.message);
    refresh();
    return { success: true as const, message };
  } catch (error) {
    return failUnexpected(error);
  }
}

export async function advanceLibraryClock(): Promise<SimpleResult> {
  return runClockChange(
    async () => supabaseAdmin().rpc("advance_clock", { p_seconds: 900 }),
    "Library time moved forward 15 minutes.",
  );
}

export async function setLibraryTime(_prev: SimpleResult | null, formData: FormData): Promise<SimpleResult> {
  const date = field(formData, "date");
  const time = field(formData, "time");
  const fieldErrors: Record<string, string> = {};
  if (!isValidDate(date)) fieldErrors.date = "Choose a date between 2000 and 2100.";
  if (!isValidTime(time)) fieldErrors.time = "Choose a time.";
  if (Object.keys(fieldErrors).length > 0) return { success: false, error: "Check the highlighted fields.", fieldErrors };
  try {
    const ctx = await getLibraryContext();
    const target = zonedTimeToUtc(date, time, ctx.library.timezone);
    const offset = Math.round((target.getTime() - ctx.realNow.getTime()) / 1000);
    return runClockChange(async () => supabaseAdmin().rpc("set_clock_offset", { p_seconds: offset }), "Library time updated.");
  } catch (error) {
    return failUnexpected(error);
  }
}

export async function startOverAction(): Promise<SimpleResult> {
  try {
    await startOver();
    refresh();
    return { success: true, message: "Today's bookings were reset. Library time is 1:55 PM." };
  } catch (error) {
    return failUnexpected(error);
  }
}

async function loadBooking(id: string): Promise<BookingRow | null> {
  const { data, error } = await supabaseAdmin().from("booking").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the booking: ${error.message}`);
  return data as BookingRow | null;
}

export interface MoveOption {
  roomId: string;
  roomName: string;
  capacity: number;
}

/** Rooms that fit the party and are free for the booking's current time. */
export async function getMoveOptions(
  bookingId: string,
): Promise<{ success: true; rooms: MoveOption[] } | ActionFailure> {
  try {
    if (!UUID_RE.test(bookingId)) return { success: false, error: "That booking was not found." };
    const [ctx, row] = await Promise.all([getLibraryContext(), loadBooking(bookingId)]);
    if (!row) {
      refresh();
      return { success: false, error: GONE };
    }
    const booking = toBoardBooking(row);
    const settings = settingsOf(ctx.library);
    const [rooms, rows] = await Promise.all([
      loadRooms(),
      loadBookingsStartingBetween(
        new Date(booking.startAt.getTime() - 24 * 3_600_000),
        new Date(booking.endAt.getTime() + 24 * 3_600_000),
      ),
    ]);
    const others = rows.filter((r) => r.id !== row.id).map(toBoardBooking);
    const free = rooms.filter((room) => {
      if (room.id === row.room_id || room.capacity < row.party_size) return false;
      const busy = activeIntervals(
        others.filter((b) => b.roomId === room.id),
        settings,
        ctx.now,
      );
      return busy.every((i) => i.end <= booking.startAt || i.start >= booking.endAt);
    });
    return { success: true, rooms: free.map((r) => ({ roomId: r.id, roomName: r.name, capacity: r.capacity })) };
  } catch (error) {
    return failUnexpected(error);
  }
}

export type MoveFormState = { success: true; roomId: string; message: string } | ActionFailure | null;

export async function moveBooking(_prev: MoveFormState, formData: FormData): Promise<MoveFormState> {
  try {
    const bookingId = field(formData, "bookingId");
    const roomId = field(formData, "roomId");
    if (!UUID_RE.test(bookingId)) return { success: false, error: "That booking was not found." };
    if (!UUID_RE.test(roomId)) return { success: false, error: "Check the highlighted fields.", fieldErrors: { roomId: "Choose a room." } };
    const [ctx, row, room] = await Promise.all([getLibraryContext(), loadBooking(bookingId), loadRoom(roomId)]);
    if (!row) {
      refresh();
      return { success: false, error: GONE };
    }
    if (!room) return { success: false, error: "Check the highlighted fields.", fieldErrors: { roomId: "That room is not available." } };
    const tz = ctx.library.timezone;
    const booking = toBoardBooking(row);
    const status = deriveStatus(booking, settingsOf(ctx.library), ctx.now);
    if (status !== "booked" && !(status === "checked_in" && ctx.now < booking.endAt)) {
      refresh();
      return { success: false, error: "This booking can no longer be moved. The board has been refreshed." };
    }

    const checked = validateMove(
      { start: field(formData, "start"), end: field(formData, "end") },
      {
        booking: { status, startAt: booking.startAt, endAt: booking.endAt, partySize: booking.partySize },
        room,
        openingHours: ctx.library.opening_hours,
        timeZone: tz,
        now: ctx.now,
      },
    );
    if (!checked.ok) return { success: false, error: "Check the highlighted fields.", fieldErrors: checked.fieldErrors };

    const { start, end } = checked.value;
    const { data, error } = await supabaseAdmin().rpc("move_booking", {
      p_booking_id: bookingId,
      p_room_id: room.id,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_actor: "staff",
    });
    if (error) throw new Error(`move_booking failed: ${error.message}`);
    refresh();

    const result = data as { ok: true } | { ok: false; reason?: "changed"; conflict?: { start_at: string; end_at: string } };
    const range = formatTimeRange(start, end, tz);
    if (result.ok) {
      return { success: true, roomId: room.id, message: `Moved ${booking.patronName} to ${room.name}, ${range}.` };
    }
    if (!result.conflict) {
      return { success: false, error: "This booking changed. The board has been refreshed." };
    }
    const label = `This room is taken ${formatTimeRange(new Date(result.conflict.start_at), new Date(result.conflict.end_at), tz)}`;
    const date = libraryDateString(booking.startAt, tz);
    return {
      success: false,
      error: label,
      conflict: { label, alternatives: await alternativesFor(room.id, date, start, end, booking.partySize) },
    };
  } catch (error) {
    return failUnexpected(error);
  }
}
