create extension if not exists btree_gist;
create extension if not exists pgcrypto with schema extensions;

create type room_type as enum ('study', 'meeting', 'community');
create type booking_channel as enum ('desk', 'web', 'walk_in');
create type booking_status as enum ('booked', 'checked_in', 'cancelled', 'released', 'completed');
create type booking_actor as enum ('staff', 'patron', 'system');
create type booking_event_type as enum ('created', 'checked_in', 'released', 'cancelled', 'conflict_blocked');

-- Unambiguous alphabet (no 0/O/1/I/L) so codes can be read aloud and typed on a phone.
create function generate_booking_code() returns text
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(6);
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

create table library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  timezone text not null,
  opening_hours jsonb not null,
  checkin_window_min int not null default 15,
  early_checkin_min int not null default 10,
  clock_offset_seconds int not null default 0
);

create table room (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references library (id),
  name text not null,
  type room_type not null,
  capacity int not null check (capacity > 0),
  amenities text[] not null default '{}',
  location_in_building text not null,
  qr_token text not null unique,
  active bool not null default true
);

create table booking (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references room (id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  patron_name text not null,
  card_last4 char(4) not null check (card_last4 ~ '^[0-9]{4}$'),
  party_size int not null check (party_size >= 1),
  channel booking_channel not null,
  status booking_status not null default 'booked',
  booking_code text not null unique default generate_booking_code(),
  checked_in_at timestamptz,
  released_at timestamptz,
  created_by booking_actor not null check (created_by in ('staff', 'patron')),
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  constraint booking_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('booked', 'checked_in'))
);

create index booking_start_at_idx on booking (start_at);

-- "at" is library-clock time (real time + clock offset), supplied by the caller.
create table booking_event (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references booking (id) on delete cascade,
  room_id uuid not null references room (id),
  type booking_event_type not null,
  at timestamptz not null,
  actor booking_actor not null
);

create index booking_event_at_idx on booking_event (at);

alter table library enable row level security;
alter table room enable row level security;
alter table booking enable row level security;
alter table booking_event enable row level security;

revoke all on library, room, booking, booking_event from public, anon, authenticated;
grant all on library, room, booking, booking_event to service_role;

revoke execute on function generate_booking_code() from public, anon, authenticated;
grant execute on function generate_booking_code() to service_role;
