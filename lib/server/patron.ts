import "server-only";
import { activeIntervals, openingHoursFor, roomStateAt, type Interval, type RoomState } from "@/lib/schedule";
import { libraryDayBounds, zonedTimeToUtc } from "@/lib/clock";
import { loadBookingsStartingBetween, loadRooms, settingsOf, toBoardBooking } from "@/lib/server/board";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { BookingRow, LibraryRow, RoomRow } from "@/types/domain";

const TYPE_ORDER = ["study", "meeting", "community"];

export function sortRooms(rooms: RoomRow[]): RoomRow[] {
  return [...rooms].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
}

export interface PatronDay {
  rooms: RoomRow[];
  open: Interval | null;
  /** Busy time per room. Patron pages only ever get time ranges, never who booked. */
  busyByRoom: Map<string, Interval[]>;
  /** Each room's state at `now`; only filled when `date` is the library's today. */
  stateByRoom: Map<string, RoomState>;
}

export async function loadPatronDay(library: LibraryRow, date: string, now: Date, isToday: boolean): Promise<PatronDay> {
  const tz = library.timezone;
  const settings = settingsOf(library);
  const bounds = libraryDayBounds(zonedTimeToUtc(date, "12:00", tz), tz);
  const [rooms, rows] = await Promise.all([loadRooms(), loadBookingsStartingBetween(bounds.start, bounds.end)]);
  const open = openingHoursFor(date, library.opening_hours, tz);
  const busyByRoom = new Map<string, Interval[]>();
  const stateByRoom = new Map<string, RoomState>();
  for (const room of rooms) {
    const bookings = rows.filter((r) => r.room_id === room.id).map(toBoardBooking);
    busyByRoom.set(room.id, activeIntervals(bookings, settings, now));
    if (isToday) stateByRoom.set(room.id, roomStateAt(now, bookings, settings, open));
  }
  return { rooms: sortRooms(rooms), open, busyByRoom, stateByRoom };
}

export async function loadBookingById(id: string): Promise<BookingRow | null> {
  const { data, error } = await supabaseAdmin().from("booking").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the booking: ${error.message}`);
  return data as BookingRow | null;
}
