-- Supabase rejects UPDATE without a WHERE clause on API requests (safeupdate).
create or replace function set_clock_offset(p_seconds int) returns void
language sql volatile
set search_path = public
as $$
  update library set clock_offset_seconds = p_seconds where id is not null;
$$;

create or replace function advance_clock(p_seconds int) returns void
language sql volatile
set search_path = public
as $$
  update library set clock_offset_seconds = clock_offset_seconds + p_seconds where id is not null;
$$;
