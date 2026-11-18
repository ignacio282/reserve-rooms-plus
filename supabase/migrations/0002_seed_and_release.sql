do $$
declare
  lib_id uuid;
begin
  if exists (select 1 from library) then
    return;
  end if;

  insert into library (name, address, timezone, opening_hours)
  values (
    'Maple Hollow Public Library',
    '412 Orchard Lane, Maple Hollow',
    'America/New_York',
    '{"mon":{"open":"09:00","close":"20:00"},"tue":{"open":"09:00","close":"20:00"},"wed":{"open":"09:00","close":"20:00"},"thu":{"open":"09:00","close":"20:00"},"fri":{"open":"10:00","close":"18:00"},"sat":{"open":"10:00","close":"18:00"},"sun":{"open":"10:00","close":"18:00"}}'
  )
  returning id into lib_id;

  insert into room (library_id, name, type, capacity, amenities, location_in_building, qr_token)
  select lib_id, v.name, v.type::room_type, v.capacity, v.amenities, v.location, replace(gen_random_uuid()::text, '-', '')
  from (values
    ('Study Room A', 'study', 4, array['Whiteboard', 'Power outlets'], '2nd floor, east wing'),
    ('Study Room B', 'study', 4, array['Whiteboard', 'Power outlets'], '2nd floor, east wing'),
    ('Study Room C', 'study', 2, array['Quiet room', 'Power outlets'], '2nd floor, reading area'),
    ('Study Room D', 'study', 6, array['Wall screen', 'Whiteboard', 'Power outlets'], '2nd floor, west wing'),
    ('Oak Meeting Room', 'meeting', 10, array['Display screen', 'Video calls', 'Whiteboard'], '1st floor, behind the front desk'),
    ('Birch Meeting Room', 'meeting', 8, array['Display screen', 'Whiteboard'], '1st floor, near the children''s area'),
    ('Community Room', 'community', 60, array['Projector', 'Sound system', 'Kitchenette', 'Movable tables'], 'Ground floor, side entrance'),
    ('Creekside Room', 'community', 30, array['Projector', 'Movable tables', 'Garden view'], 'Ground floor, garden side')
  ) as v(name, type, capacity, amenities, location);
end;
$$;

-- "Today" is the real current date in the library timezone, so moving the clock to
-- another date never reseeds that date.
create function seed_today(p_force boolean) returns boolean
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  lib library%rowtype;
  today date;
  day_start timestamptz;
  day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('seed_today'));

  select * into strict lib from library;
  today := (now() at time zone lib.timezone)::date;
  day_start := today::timestamp at time zone lib.timezone;
  day_end := (today + 1)::timestamp at time zone lib.timezone;

  if not p_force and exists (
    select 1 from booking where start_at >= day_start and start_at < day_end
  ) then
    return false;
  end if;

  delete from booking where start_at >= day_start and start_at < day_end;
  delete from booking_event
  where type = 'conflict_blocked' and at >= day_start and at < day_end;

  insert into booking (
    room_id, start_at, end_at, patron_name, card_last4, party_size,
    channel, status, checked_in_at, released_at, created_by
  )
  select
    r.id,
    (today + v.start_t) at time zone lib.timezone,
    (today + v.end_t) at time zone lib.timezone,
    v.patron, v.last4, v.party, v.channel::booking_channel,
    case v.kind
      when 'checked_in' then 'checked_in'
      when 'released' then 'released'
      else 'booked'
    end::booking_status,
    case when v.kind = 'checked_in' then (today + v.checkin_t) at time zone lib.timezone end,
    case when v.kind = 'released'
      then ((today + v.start_t) at time zone lib.timezone) + make_interval(mins => lib.checkin_window_min)
    end,
    v.created_by::booking_actor
  from (values
    ('Study Room A', time '10:00', time '11:00', 'Maria Lopez', '4821', 2, 'desk', 'staff', 'checked_in', time '10:03'),
    ('Study Room A', time '14:00', time '15:00', 'Daniel Okafor', '7390', 3, 'web', 'patron', 'booked', null),
    ('Study Room A', time '16:00', time '17:30', 'Priya Nair', '1156', 4, 'web', 'patron', 'booked', null),
    ('Study Room B', time '10:30', time '12:00', 'James Whitfield', '6604', 2, 'web', 'patron', 'released', null),
    ('Study Room B', time '11:00', time '12:00', 'Tomas Rivera', '2287', 1, 'walk_in', 'patron', 'checked_in', time '11:00'),
    ('Study Room B', time '15:00', time '16:00', 'Grace Kim', '9043', 2, 'desk', 'staff', 'booked', null),
    ('Study Room C', time '13:00', time '15:00', 'Aisha Bello', '3378', 1, 'web', 'patron', 'checked_in', time '13:04'),
    ('Study Room C', time '16:30', time '17:30', 'Henry Walsh', '5512', 2, 'web', 'patron', 'booked', null),
    ('Study Room D', time '12:00', time '13:00', 'Leah Cohen', '8129', 5, 'desk', 'staff', 'released', null),
    ('Study Room D', time '15:30', time '17:00', 'Sam Patel', '4467', 4, 'web', 'patron', 'booked', null),
    ('Oak Meeting Room', time '10:00', time '12:00', 'Margaret Ellis', '2950', 8, 'desk', 'staff', 'checked_in', time '09:56'),
    ('Oak Meeting Room', time '14:30', time '16:00', 'Robert Chen', '6081', 6, 'desk', 'staff', 'booked', null),
    ('Birch Meeting Room', time '11:30', time '12:30', 'Elena Petrova', '7714', 5, 'web', 'patron', 'checked_in', time '11:28'),
    ('Community Room', time '17:00', time '18:00', 'Linda Moore', '3825', 25, 'desk', 'staff', 'booked', null),
    ('Creekside Room', time '10:00', time '11:30', 'Kevin Brooks', '1093', 12, 'desk', 'staff', 'checked_in', time '10:05')
  ) as v(room_name, start_t, end_t, patron, last4, party, channel, created_by, kind, checkin_t)
  join room r on r.name = v.room_name and r.library_id = lib.id;

  insert into booking_event (booking_id, room_id, type, at, actor)
  select b.id, b.room_id, 'created',
    case when b.channel = 'walk_in' then b.start_at else b.start_at - interval '3 hours' end,
    b.created_by
  from booking b
  where b.start_at >= day_start and b.start_at < day_end;

  insert into booking_event (booking_id, room_id, type, at, actor)
  select b.id, b.room_id, 'checked_in', b.checked_in_at, 'patron'
  from booking b
  where b.start_at >= day_start and b.start_at < day_end and b.checked_in_at is not null;

  insert into booking_event (booking_id, room_id, type, at, actor)
  select b.id, b.room_id, 'released', b.released_at, 'system'
  from booking b
  where b.start_at >= day_start and b.start_at < day_end and b.status = 'released';

  update library
  set clock_offset_seconds = round(extract(epoch from
    ((today + time '13:55') at time zone lib.timezone) - now()))::int
  where id = lib.id;

  return true;
end;
$$;

-- The exclusion constraint only sees stored statuses, so an unpersisted no-show still
-- blocks its slot: call this before reading a schedule and before inserting a booking.
create function release_overdue() returns int
language sql volatile
set search_path = public
as $$
  with lib as (
    select checkin_window_min, now() + make_interval(secs => clock_offset_seconds) as library_now
    from library
  ),
  released as (
    update booking b
    set status = 'released',
        released_at = b.start_at + make_interval(mins => lib.checkin_window_min)
    from lib
    where b.status = 'booked'
      and b.checked_in_at is null
      and lib.library_now > b.start_at + make_interval(mins => lib.checkin_window_min)
    returning b.id, b.room_id, b.released_at
  ),
  events as (
    insert into booking_event (booking_id, room_id, type, at, actor)
    select id, room_id, 'released', released_at, 'system' from released
    returning 1
  )
  select count(*)::int from events;
$$;

revoke execute on function seed_today(boolean) from public, anon, authenticated;
revoke execute on function release_overdue() from public, anon, authenticated;
grant execute on function seed_today(boolean) to service_role;
grant execute on function release_overdue() to service_role;
