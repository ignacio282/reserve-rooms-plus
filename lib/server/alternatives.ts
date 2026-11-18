import "server-only";
import { libraryTimeString } from "@/lib/clock";
import { formatTimeRange } from "@/lib/format";
import { activeIntervals, findAlternatives, openingHoursFor, type Interval } from "@/lib/schedule";
import { loadBookingsStartingBetween, loadRooms, settingsOf, toBoardBooking } from "@/lib/server/board";
import { getLibraryContext } from "@/lib/server/library";

export interface AlternativeOption {
  roomId: string;
  roomName: string;
  start: string;
  end: string;
  label: string;
}

/** Free alternatives after a blocked booking: later in the same room, then other rooms at the same time. */
export async function alternativesFor(
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
