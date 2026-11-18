-- Moves a booking in place (same id and booking code). Booked bookings may change
-- room and time; checked-in bookings may change room only, before they end.
create function move_booking(
  p_booking_id uuid,
  p_room_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_actor booking_actor
) returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare
  v_now timestamptz;
  b booking%rowtype;
  v_conflict booking%rowtype;
begin
  perform release_overdue();
  v_now := library_now();

  select * into b from booking where id = p_booking_id for update;
  if not found or not (
    b.status = 'booked'
    or (b.status = 'checked_in' and v_now < b.end_at and b.start_at = p_start and b.end_at = p_end)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'changed');
  end if;

  begin
    update booking set room_id = p_room_id, start_at = p_start, end_at = p_end where id = p_booking_id;
  exception when exclusion_violation then
    select * into v_conflict
    from booking
    where room_id = p_room_id
      and id <> p_booking_id
      and status in ('booked', 'checked_in')
      and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
    order by start_at
    limit 1;

    insert into booking_event (booking_id, room_id, type, at, actor)
    values (null, p_room_id, 'conflict_blocked', v_now, p_actor);

    return jsonb_build_object(
      'ok', false,
      'conflict', jsonb_build_object('start_at', v_conflict.start_at, 'end_at', v_conflict.end_at)
    );
  end;

  insert into booking_event (booking_id, room_id, type, at, actor)
  values (p_booking_id, p_room_id, 'moved', v_now, p_actor);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function move_booking(uuid, uuid, timestamptz, timestamptz, booking_actor) from public, anon, authenticated;
grant execute on function move_booking(uuid, uuid, timestamptz, timestamptz, booking_actor) to service_role;
