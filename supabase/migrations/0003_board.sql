create function library_now() returns timestamptz
language sql stable
set search_path = public
as $$
  select now() + make_interval(secs => clock_offset_seconds) from library;
$$;

-- Releases overdue no-shows first so freed time can be booked, then inserts. A
-- blocked overlap leaves no booking row, only a conflict_blocked event.
create function create_booking(
  p_room_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_patron_name text,
  p_card_last4 text,
  p_party_size int,
  p_channel booking_channel,
  p_created_by booking_actor
) returns jsonb
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  v_now timestamptz;
  v_id uuid;
  v_code text;
  v_conflict booking%rowtype;
begin
  perform release_overdue();
  v_now := library_now();

  begin
    insert into booking (room_id, start_at, end_at, patron_name, card_last4, party_size, channel, created_by)
    values (p_room_id, p_start, p_end, p_patron_name, p_card_last4, p_party_size, p_channel, p_created_by)
    returning id, booking_code into v_id, v_code;
  exception when exclusion_violation then
    select * into v_conflict
    from booking
    where room_id = p_room_id
      and status in ('booked', 'checked_in')
      and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
    order by start_at
    limit 1;

    insert into booking_event (booking_id, room_id, type, at, actor)
    values (null, p_room_id, 'conflict_blocked', v_now, p_created_by);

    return jsonb_build_object(
      'ok', false,
      'conflict', jsonb_build_object('start_at', v_conflict.start_at, 'end_at', v_conflict.end_at)
    );
  end;

  insert into booking_event (booking_id, room_id, type, at, actor)
  values (v_id, p_room_id, 'created', v_now, p_created_by);

  return jsonb_build_object('ok', true, 'id', v_id, 'booking_code', v_code);
end;
$$;

-- Each action is one guarded update plus its event; false means the booking is no
-- longer in a state that allows the action.
create function apply_booking_action(p_booking_id uuid, p_action text, p_actor booking_actor)
returns boolean
language plpgsql volatile
set search_path = public
as $$
declare
  lib library%rowtype;
  v_now timestamptz;
  v_room uuid;
  v_event booking_event_type;
begin
  perform release_overdue();
  select * into strict lib from library;
  v_now := now() + make_interval(secs => lib.clock_offset_seconds);

  if p_action = 'check_in' then
    v_event := 'checked_in';
    update booking set status = 'checked_in', checked_in_at = v_now
    where id = p_booking_id and status = 'booked' and checked_in_at is null
      and v_now >= start_at - make_interval(mins => lib.early_checkin_min)
      and v_now <= start_at + make_interval(mins => lib.checkin_window_min)
    returning room_id into v_room;
  elsif p_action = 'cancel' then
    v_event := 'cancelled';
    update booking set status = 'cancelled'
    where id = p_booking_id and status = 'booked'
    returning room_id into v_room;
  elsif p_action = 'release' then
    v_event := 'released';
    update booking set status = 'released', released_at = v_now
    where id = p_booking_id and status = 'booked'
      and v_now >= start_at - make_interval(mins => lib.early_checkin_min)
    returning room_id into v_room;
  else
    raise exception 'Unknown booking action: %', p_action;
  end if;

  if v_room is null then
    return false;
  end if;

  insert into booking_event (booking_id, room_id, type, at, actor)
  values (p_booking_id, v_room, v_event, v_now, p_actor);
  return true;
end;
$$;

create function set_clock_offset(p_seconds int) returns void
language sql volatile
set search_path = public
as $$
  update library set clock_offset_seconds = p_seconds;
$$;

create function advance_clock(p_seconds int) returns void
language sql volatile
set search_path = public
as $$
  update library set clock_offset_seconds = clock_offset_seconds + p_seconds;
$$;

revoke execute on function library_now() from public, anon, authenticated;
revoke execute on function create_booking(uuid, timestamptz, timestamptz, text, text, int, booking_channel, booking_actor) from public, anon, authenticated;
revoke execute on function apply_booking_action(uuid, text, booking_actor) from public, anon, authenticated;
revoke execute on function set_clock_offset(int) from public, anon, authenticated;
revoke execute on function advance_clock(int) from public, anon, authenticated;
grant execute on function library_now() to service_role;
grant execute on function create_booking(uuid, timestamptz, timestamptz, text, text, int, booking_channel, booking_actor) to service_role;
grant execute on function apply_booking_action(uuid, text, booking_actor) to service_role;
grant execute on function set_clock_offset(int) to service_role;
grant execute on function advance_clock(int) to service_role;
