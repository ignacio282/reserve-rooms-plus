export type RoomType = "study" | "meeting" | "community";
export type BookingChannel = "desk" | "web" | "walk_in";
export type StoredBookingStatus = "booked" | "checked_in" | "cancelled" | "released" | "completed";
export type BookingActor = "staff" | "patron" | "system";
export type BookingEventType = "created" | "checked_in" | "released" | "cancelled" | "conflict_blocked" | "moved";

export interface OpeningHours {
  [weekday: string]: { open: string; close: string };
}

export interface LibraryRow {
  id: string;
  name: string;
  address: string;
  timezone: string;
  opening_hours: OpeningHours;
  checkin_window_min: number;
  early_checkin_min: number;
  clock_offset_seconds: number;
}

export interface RoomRow {
  id: string;
  library_id: string;
  name: string;
  type: RoomType;
  capacity: number;
  amenities: string[];
  location_in_building: string;
  qr_token: string;
  active: boolean;
}

export interface BookingRow {
  id: string;
  room_id: string;
  start_at: string;
  end_at: string;
  patron_name: string;
  card_last4: string;
  party_size: number;
  channel: BookingChannel;
  status: StoredBookingStatus;
  booking_code: string;
  checked_in_at: string | null;
  released_at: string | null;
  created_by: Exclude<BookingActor, "system">;
  created_at: string;
}

export interface BookingEventRow {
  id: string;
  booking_id: string | null;
  room_id: string;
  type: BookingEventType;
  at: string;
  actor: BookingActor;
}
