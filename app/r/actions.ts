"use server";

import { refresh } from "next/cache";
import { outcomeMessage, PAUSED_ROOM, UNEXPECTED } from "@/app/_components/checkin-messages";
import { MAX_MINUTES_BY_TYPE, validatePatronFields } from "@/lib/booking-input";
import { bookingCheckInOutcome, isPaused, matchBooking, parseIdentifier, roomCheckInView, walkInEnd } from "@/lib/checkin";
import { libraryDateString } from "@/lib/clock";
import { formatTime } from "@/lib/format";
import { availableNow, openingHoursFor } from "@/lib/schedule";
import { settingsOf } from "@/lib/server/board";
import { loadRoomByToken, loadRoomDay, recentFailures, recordFailure } from "@/lib/server/checkin";
import { isValidCheckinCode } from "@/lib/server/checkin-code";
import { getLibraryContext, type LibraryContext } from "@/lib/server/library";
import { loadPatronDay } from "@/lib/server/patron";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { RoomRow } from "@/types/domain";

export interface FreeRoom {
  id: string;
  name: string;
  until: string;
}

export type RoomResult =
  | { success: true; kind: "checked_in"; message: string }
  | { success: true; kind: "walk_in"; message: string; bookingCode: string; bookingId: string }
  | { success: false; kind: "invalid"; error: string; fieldErrors: Record<string, string> }
  | { success: false; kind: "wrong_code" | "paused" | "state" | "unexpected"; error: string }
  | { success: false; kind: "taken"; error: string; nextFree: string | null; otherRooms: FreeRoom[] }
  | null;

const EXPIRED = "That code has changed. Scan the code on the room's door display.";
const NEED_CODE = "Enter the 6-digit code shown on the room's door display.";
const NOT_VALID = "This room link is not valid. Scan the code on the room's door display again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Pause check and code check for the room. Null means the code is good. */
async function guardRoomCode(room: RoomRow, code: string): Promise<RoomResult> {
  if (isPaused(await recentFailures("room", room.id))) return { success: false, kind: "paused", error: PAUSED_ROOM };
  if (isValidCheckinCode(room.id, code)) return null;
  const failures = await recordFailure("room", room.id);
  return isPaused(failures)
    ? { success: false, kind: "paused", error: PAUSED_ROOM }
    : { success: false, kind: "wrong_code", error: EXPIRED };
}

/** When this room is free next, plus other rooms free right now. */
async function takenResult(ctx: LibraryContext, room: RoomRow, nextFree: Date | null, error: string): Promise<RoomResult> {
  const tz = ctx.library.timezone;
  const day = await loadPatronDay(ctx.library, libraryDateString(ctx.now, tz), ctx.now, true);
  const otherRooms = availableNow(
    day.rooms.filter((r) => r.id !== room.id),
    day.stateByRoom,
  ).map(({ room: r, freeUntil }) => ({ id: r.id, name: r.name, until: formatTime(freeUntil, tz) }));
  return { success: false, kind: "taken", error, nextFree: nextFree ? formatTime(nextFree, tz) : null, otherRooms };
}

async function roomView(ctx: LibraryContext, room: RoomRow) {
  const tz = ctx.library.timezone;
  const bookings = await loadRoomDay(room, ctx.library, ctx.now);
  const open = openingHoursFor(libraryDateString(ctx.now, tz), ctx.library.opening_hours, tz);
  return { bookings, view: roomCheckInView(ctx.now, bookings, settingsOf(ctx.library), open) };
}

/** Fallback check-in at the room: current room code plus booking code or card last 4. */
export async function checkInAtRoom(_prev: RoomResult, formData: FormData): Promise<RoomResult> {
  try {
    const code = field(formData, "code").trim();
    const identifier = parseIdentifier(field(formData, "identifier"));
    const fieldErrors: Record<string, string> = {};
    if (!code) fieldErrors.code = NEED_CODE;
    if (!identifier) fieldErrors.identifier = "Enter your 6-character booking code or the last 4 digits of your library card.";
    if (!identifier || !code) return { success: false, kind: "invalid", error: "Check the highlighted fields.", fieldErrors };

    const room = await loadRoomByToken(field(formData, "roomToken"));
    if (!room) return { success: false, kind: "state", error: NOT_VALID };
    const guard = await guardRoomCode(room, code);
    if (guard) return guard;

    const ctx = await getLibraryContext();
    const tz = ctx.library.timezone;
    const settings = settingsOf(ctx.library);
    const { bookings, view } = await roomView(ctx, room);
    const match = matchBooking(bookings, identifier, settings, ctx.now);
    if (!match) {
      if (view.state.kind === "in_use" || view.state.kind === "awaiting_check_in") {
        return takenResult(ctx, room, view.nextFree, `${room.name} is booked by someone else right now.`);
      }
      return {
        success: false,
        kind: "state",
        error: `We could not find a booking for ${room.name} today with that code. Check it and try again.`,
      };
    }

    const blocked = outcomeMessage(bookingCheckInOutcome(match, settings, ctx.now), tz);
    if (blocked) return { success: false, kind: "state", error: blocked };

    const { data, error } = await supabaseAdmin().rpc("apply_booking_action", {
      p_booking_id: match.id,
      p_action: "check_in",
      p_actor: "patron",
    });
    if (error) throw new Error(`apply_booking_action failed: ${error.message}`);
    refresh();
    if (data !== true) return { success: false, kind: "state", error: "This booking just changed. Try again." };
    return {
      success: true,
      kind: "checked_in",
      message: `You are checked in. ${room.name} is yours until ${formatTime(match.endAt, tz)}.`,
    };
  } catch (error) {
    console.error(error);
    return { success: false, kind: "unexpected", error: UNEXPECTED };
  }
}

/** Walk-in: books a free room from now until it is next needed, checked in at once. */
export async function walkIn(_prev: RoomResult, formData: FormData): Promise<RoomResult> {
  try {
    const room = await loadRoomByToken(field(formData, "roomToken"));
    if (!room) return { success: false, kind: "state", error: NOT_VALID };
    const code = field(formData, "code").trim();
    const patron = validatePatronFields(
      { patronName: field(formData, "patronName"), cardLast4: field(formData, "cardLast4"), partySize: field(formData, "partySize") },
      room.capacity,
    );
    const fieldErrors = { ...patron.fieldErrors };
    if (!code) fieldErrors.code = NEED_CODE;
    if (Object.keys(fieldErrors).length > 0) {
      return { success: false, kind: "invalid", error: "Check the highlighted fields.", fieldErrors };
    }
    const guard = await guardRoomCode(room, code);
    if (guard) return guard;

    const ctx = await getLibraryContext();
    const tz = ctx.library.timezone;
    const { view } = await roomView(ctx, room);
    if (view.state.kind === "closed") return { success: false, kind: "state", error: `${room.name} is closed now.` };
    if (view.state.kind !== "free") {
      refresh();
      return takenResult(ctx, room, view.nextFree, `${room.name} is no longer free.`);
    }

    const end = walkInEnd(ctx.now, view.state.until, MAX_MINUTES_BY_TYPE[room.type]);
    const { patronName, cardLast4, partySize } = patron.value;
    const { data, error } = await supabaseAdmin().rpc("create_walk_in", {
      p_room_id: room.id,
      p_end: end.toISOString(),
      p_patron_name: patronName,
      p_card_last4: cardLast4,
      p_party_size: partySize,
    });
    if (error) throw new Error(`create_walk_in failed: ${error.message}`);
    refresh();
    const result = data as { ok: true; id: string; booking_code: string } | { ok: false; reason: "taken" | "ended" };
    if (!result.ok) {
      if (result.reason === "ended") return { success: false, kind: "state", error: `${room.name} is closed now.` };
      const latest = await roomView(await getLibraryContext(), room);
      return takenResult(ctx, room, latest.view.nextFree, `Sorry, someone just booked ${room.name}.`);
    }
    return {
      success: true,
      kind: "walk_in",
      message: `You are checked in. ${room.name} is yours until ${formatTime(end, tz)}.`,
      bookingCode: result.booking_code,
      bookingId: result.id,
    };
  } catch (error) {
    console.error(error);
    return { success: false, kind: "unexpected", error: UNEXPECTED };
  }
}
