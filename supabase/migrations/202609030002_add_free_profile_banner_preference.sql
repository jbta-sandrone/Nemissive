begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or not exists (
      select 1
      from pg_catalog.pg_attribute as attribute_row
      where attribute_row.attrelid = 'public.profiles'::regclass
        and attribute_row.attname = 'avatar_border'
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
    ) then
    raise exception 'Profile banner preference dependencies are missing.';
  end if;

  if exists (
      select 1
      from pg_catalog.pg_attribute as attribute_row
      where attribute_row.attrelid = 'public.profiles'::regclass
        and attribute_row.attname = 'profile_banner'
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
    )
    or pg_catalog.to_regprocedure('public.set_my_profile_banner(text)') is not null then
    raise exception 'A profile banner preference is already present or partially installed.';
  end if;
end;
$preflight$;

alter table public.profiles
  add column profile_banner text not null default 'none'::text;

alter table public.profiles
  add constraint profiles_profile_banner_check
  check (profile_banner = any (array[
    'none'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text,
    'ocean'::text,
    'twilight'::text
  ]));

comment on column public.profiles.profile_banner is
  'Public-safe bounded profile banner preference. None renders the default profile surface.';

revoke select (profile_banner) on table public.profiles from public, anon;
revoke update (profile_banner) on table public.profiles from public, anon, authenticated;
grant select (profile_banner) on table public.profiles to authenticated;

create function public.set_my_profile_banner(candidate_banner text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_banner text := pg_catalog.lower(pg_catalog.btrim(candidate_banner));
  v_saved_banner text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated account is unavailable.';
  end if;

  if v_banner is null or v_banner <> all (array[
    'none'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text,
    'ocean'::text,
    'twilight'::text
  ]) then
    raise exception using errcode = '22023', message = 'The profile banner is invalid.';
  end if;

  update public.profiles as profile_row
  set profile_banner = v_banner
  where profile_row.id = v_user_id
  returning profile_row.profile_banner into v_saved_banner;

  if v_saved_banner is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_saved_banner;
end;
$$;

revoke all on function public.set_my_profile_banner(text) from public, anon, authenticated;
grant execute on function public.set_my_profile_banner(text) to authenticated;

comment on function public.set_my_profile_banner(text) is
  'Validates and updates only auth.uid() free profile banner preference for an active account.';

-- Extend the existing privacy-filtered profile publication. This reuses the
-- one profile Realtime channel; it does not create a banner subscription.
do $realtime$
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
$realtime$;

do $verify$
declare
  v_setter_oid oid := pg_catalog.to_regprocedure('public.set_my_profile_banner(text)');
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.profiles'::regclass
      and attribute_row.attname = 'profile_banner'
      and attribute_row.atttypid = 'text'::regtype
      and attribute_row.attnotnull
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
      and exists (
        select 1
        from pg_catalog.pg_attrdef as default_row
        where default_row.adrelid = attribute_row.attrelid
          and default_row.adnum = attribute_row.attnum
          and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''none''::text'
      )
  ) or exists (
    select 1
    from public.profiles as profile_row
    where profile_row.profile_banner is null
      or profile_row.profile_banner <> all (array[
        'none'::text,
        'azure'::text,
        'emerald'::text,
        'violet'::text,
        'rose'::text,
        'amber'::text,
        'ocean'::text,
        'twilight'::text
      ])
  ) then
    raise exception 'The profile banner column failed verification.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_profile_banner_check'
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%none%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%azure%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%emerald%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%violet%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%rose%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%amber%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%ocean%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%twilight%'
  ) then
    raise exception 'The profile banner constraint failed verification.';
  end if;

  if v_setter_oid is null or not exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid = v_setter_oid
      and procedure_row.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(procedure_row.proconfig) as function_setting(setting)
        where pg_catalog.btrim(pg_catalog.split_part(function_setting.setting, '=', 1)) = 'search_path'
          and pg_catalog.btrim(
            pg_catalog.split_part(function_setting.setting, '=', 2),
            E' \t"'
          ) = ''
      )
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%auth.uid()%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.is_active_account%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%where profile_row.id = v_user_id%'
  ) then
    raise exception 'The secure profile banner setter failed verification.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('anon', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('public', v_setter_oid, 'execute') then
    raise exception 'The profile banner setter execute privileges failed verification.';
  end if;

  if not pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'profile_banner', 'select')
    or pg_catalog.has_column_privilege('anon', 'public.profiles', 'profile_banner', 'select')
    or pg_catalog.has_column_privilege('public', 'public.profiles', 'profile_banner', 'select') then
    raise exception 'The profile banner read privileges failed verification.';
  end if;

  -- information_schema.column_privileges and has_column_privilege both include
  -- privileges inherited from a table-level grant. They therefore cannot prove
  -- the absence of an explicit column ACL when Nemissive's established profiles
  -- table legitimately grants UPDATE at table scope. Match avatar_border's
  -- security model: retain the explicit column REVOKE above, preserve existing
  -- profile grants/policies, and verify the RLS boundary plus the separately
  -- verified bounded SECURITY DEFINER setter and EXECUTE ACL.
  if not exists (
    select 1
    from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.profiles'::regclass
      and relation_row.relrowsecurity
  ) then
    raise exception 'The profiles RLS write boundary failed verification.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
      and 'profile_banner'::name = any (publication_table.attnames)
  ) then
    raise exception 'The profile banner Realtime publication failed verification.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
