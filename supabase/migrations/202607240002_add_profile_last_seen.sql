begin;

alter table public.profiles
add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is 'Most recent low-frequency authenticated Nemissive client heartbeat for last-seen fallback.';

create or replace function public.advance_last_seen(candidate_timestamp timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_seen_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if candidate_timestamp is null then
    raise exception using errcode = '22023', message = 'A last-seen timestamp is required.';
  end if;

  if candidate_timestamp > pg_catalog.now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'The last-seen timestamp cannot be in the future.';
  end if;

  update public.profiles as profile
  set last_seen_at = case
    when profile.last_seen_at is null or candidate_timestamp > profile.last_seen_at then candidate_timestamp
    else profile.last_seen_at
  end
  where profile.id = v_user_id
  returning profile.last_seen_at into v_last_seen_at;

  if v_last_seen_at is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_last_seen_at;
end;
$$;

revoke all on function public.advance_last_seen(timestamptz) from public;
revoke all on function public.advance_last_seen(timestamptz) from anon;
grant execute on function public.advance_last_seen(timestamptz) to authenticated;

comment on function public.advance_last_seen(timestamptz) is 'Monotonically advances only auth.uid() profile last_seen_at with bounded clock skew.';

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end;
$$;

commit;
