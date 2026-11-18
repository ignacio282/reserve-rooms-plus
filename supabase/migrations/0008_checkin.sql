-- Wrong room codes, per booking (booking page) or per room (room check-in page).
-- `at` is real time: the attempt limit is a security control, not a library rule.
create table checkin_failure (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('booking', 'room')),
  subject_id uuid not null,
  at timestamptz not null default now()
);

create index checkin_failure_subject_at on checkin_failure (scope, subject_id, at);

alter table checkin_failure enable row level security;
revoke all on checkin_failure from public, anon, authenticated;
grant all on checkin_failure to service_role;

-- A walk-in books the room from the current library minute and is checked in at once,
-- because a valid room code already proves the patron is at the door.
create function create_walk_in(
  p_room_id uuid,
  p_end timestamptz,
  p_patron_name text,
  p_card_last4 text,
  p_party_size int
) returns jsonb
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  v_now timestamptz;
  v_start timestamptz;
  v_id uuid;
  v_code text;
begin
  perform release_overdue();
  v_now := library_now();
  v_start := date_trunc('minute', v_now);

  if p_end <= v_start then
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;

  begin
    insert into booking (
      room_id, start_at, end_at, patron_name, card_last4, party_size, channel, created_by, status, checked_in_at
    )
    values (p_room_id, v_start, p_end, p_patron_name, p_card_last4, p_party_size, 'walk_in', 'patron', 'checked_in', v_now)
    returning id, booking_code into v_id, v_code;
  exception when exclusion_violation then
    insert into booking_event (booking_id, room_id, type, at, actor)
    values (null, p_room_id, 'conflict_blocked', v_now, 'patron');
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  insert into booking_event (booking_id, room_id, type, at, actor)
  values (v_id, p_room_id, 'created', v_now, 'patron'),
         (v_id, p_room_id, 'checked_in', v_now, 'patron');

  return jsonb_build_object('ok', true, 'id', v_id, 'booking_code', v_code, 'end_at', p_end);
end;
$$;

revoke execute on function create_walk_in(uuid, timestamptz, text, text, int) from public, anon, authenticated;
grant execute on function create_walk_in(uuid, timestamptz, text, text, int) to service_role;
