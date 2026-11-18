import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { libraryDayBounds } from "@/lib/clock";
import { FAILURE_WINDOW_MIN, type MatchableBooking } from "@/lib/checkin";
import { loadBookingsStartingBetween, toBoardBooking, type BoardBooking } from "@/lib/server/board";
import { currentCheckinCode } from "@/lib/server/checkin-code";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { BookingRow, LibraryRow, RoomRow } from "@/types/domain";

const TOKEN_RE = /^[0-9a-f]{32}$/;

export type FailureScope = "booking" | "room";

/** The active room behind a door display or check-in link; null for anything else. */
export async function loadRoomByToken(token: string): Promise<RoomRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await supabaseAdmin().from("room").select("*").eq("qr_token", token).eq("active", true).maybeSingle();
  if (error) throw new Error(`Could not load the room: ${error.message}`);
  return data as RoomRow | null;
}

export async function recentFailures(scope: FailureScope, subjectId: string): Promise<number> {
  const since = new Date(Date.now() - FAILURE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("checkin_failure")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("subject_id", subjectId)
    .gt("at", since);
  if (error) throw new Error(`Could not read check-in attempts: ${error.message}`);
  return count ?? 0;
}

/** Records a wrong room code and returns the recent failure count including it. */
export async function recordFailure(scope: FailureScope, subjectId: string): Promise<number> {
  const { error } = await supabaseAdmin().from("checkin_failure").insert({ scope, subject_id: subjectId });
  if (error) throw new Error(`Could not record a check-in attempt: ${error.message}`);
  return recentFailures(scope, subjectId);
}

export type RoomDayBooking = BoardBooking & MatchableBooking;

export function toRoomDayBooking(row: BookingRow): RoomDayBooking {
  return { ...toBoardBooking(row), bookingCode: row.booking_code };
}

/** One room's bookings that start on the library day containing `now`. */
export async function loadRoomDay(room: RoomRow, library: LibraryRow, now: Date): Promise<RoomDayBooking[]> {
  const bounds = libraryDayBounds(now, library.timezone);
  const rows = await loadBookingsStartingBetween(bounds.start, bounds.end);
  return rows.filter((r) => r.room_id === room.id).map(toRoomDayBooking);
}

/** Origin of the current request, so the door QR opens this same deployment. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host}`;
}

export interface DoorCode {
  code: string;
  msUntilNext: number;
  checkInUrl: string;
  qrDataUrl: string;
}

export async function doorCode(room: RoomRow, origin: string): Promise<DoorCode> {
  const { code, msUntilNext } = currentCheckinCode(room.id);
  const checkInUrl = `${origin}/r/${room.qr_token}?code=${code}`;
  const svg = await QRCode.toString(checkInUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return { code, msUntilNext, checkInUrl, qrDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
