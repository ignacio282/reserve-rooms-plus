import "server-only";
import type { RuleBooking } from "@/lib/booking-rules";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { BookingRow, LibraryRow, RoomRow } from "@/types/domain";

export async function loadRooms(): Promise<RoomRow[]> {
  const { data, error } = await supabaseAdmin().from("room").select("*").eq("active", true).order("name");
  if (error) throw new Error(`Could not load rooms: ${error.message}`);
  return data as RoomRow[];
}

export async function loadRoom(id: string): Promise<RoomRow | null> {
  const { data, error } = await supabaseAdmin().from("room").select("*").eq("id", id).eq("active", true).maybeSingle();
  if (error) throw new Error(`Could not load the room: ${error.message}`);
  return data as RoomRow | null;
}

/** Bookings that start inside [start, end). */
export async function loadBookingsStartingBetween(start: Date, end: Date): Promise<BookingRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("booking")
    .select("*")
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at");
  if (error) throw new Error(`Could not load bookings: ${error.message}`);
  return data as BookingRow[];
}

export interface BoardBooking extends RuleBooking {
  id: string;
  roomId: string;
  patronName: string;
  cardLast4: string;
  partySize: number;
  channel: BookingRow["channel"];
}

export function toBoardBooking(row: BookingRow): BoardBooking {
  return {
    id: row.id,
    roomId: row.room_id,
    patronName: row.patron_name,
    cardLast4: row.card_last4,
    partySize: row.party_size,
    channel: row.channel,
    status: row.status,
    startAt: new Date(row.start_at),
    endAt: new Date(row.end_at),
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at) : null,
  };
}

export function settingsOf(library: LibraryRow) {
  return { earlyCheckinMin: library.early_checkin_min, checkinWindowMin: library.checkin_window_min };
}
