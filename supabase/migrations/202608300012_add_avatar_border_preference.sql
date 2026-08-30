begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null then
    raise exception 'Avatar border preference dependencies are missing.';
  end if;
end;
$$;

alter table public.profiles
  add column avatar_border text not null default 'none'::text;

alter table public.profiles
  add constraint profiles_avatar_border_check
  check (avatar_border = any (array[
    'none'::text,
    'pearl'::text,
    'graphite'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text
  ]));

comment on column public.profiles.avatar_border is
  'Public-safe bounded avatar frame preference. None renders no frame.';

revoke select (avatar_border) on table public.profiles from public, anon;
revoke update (avatar_border) on table public.profiles from public, anon, authenticated;
grant select (avatar_border) on table public.profiles to authenticated;

create function public.set_my_avatar_border(candidate_border text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_border text := pg_catalog.lower(pg_catalog.btrim(candidate_border));
  v_saved_border text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated account is unavailable.';
  end if;

  if v_border is null or v_border <> all (array[
    'none'::text,
    'pearl'::text,
    'graphite'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text
  ]) then
    raise exception using errcode = '22023', message = 'The avatar border is invalid.';
  end if;

  update public.profiles as profile_row
  set avatar_border = v_border
  where profile_row.id = v_user_id
  returning profile_row.avatar_border into v_saved_border;

  if v_saved_border is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_saved_border;
end;
$$;

revoke all on function public.set_my_avatar_border(text) from public, anon, authenticated;
grant execute on function public.set_my_avatar_border(text) to authenticated;

comment on function public.set_my_avatar_border(text) is
  'Validates and updates only auth.uid() avatar border preference for an active account.';

-- Add the public-safe border key to the existing privacy-filtered profile
-- Realtime payload without creating another channel.
do $$
declare
  v_profile_columns text;
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
      and publication_row.puballtables
  ) then
    raise exception 'Privacy-safe profile publication requires supabase_realtime not to publish all tables implicitly.';
  end if;

  select pg_catalog.string_agg(pg_catalog.quote_ident(attribute_row.attname), ', ' order by attribute_row.attnum)
  into v_profile_columns
  from pg_catalog.pg_attribute as attribute_row
  where attribute_row.attrelid = 'public.profiles'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and attribute_row.attname not in (
      'last_seen_at',
      'active_status_enabled',
      'last_active_enabled',
      'read_receipts_enabled',
      'message_requests_enabled'
    );

  if v_profile_columns is null then
    raise exception 'Privacy-safe Realtime profile columns could not be resolved.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime drop table public.profiles';
  end if;

  execute pg_catalog.format(
    'alter publication supabase_realtime add table public.profiles (%s)',
    v_profile_columns
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
