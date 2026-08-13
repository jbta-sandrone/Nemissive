begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'Privacy Realtime repair requires public.conversation_participants and public.profiles.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_row
    where index_row.indrelid = 'public.conversation_participants'::regclass
      and index_row.indisprimary
      and index_row.indisvalid
  ) then
    raise exception 'conversation_participants must have a valid primary key before using DEFAULT replica identity.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_row
    where index_row.indrelid = 'public.profiles'::regclass
      and index_row.indisprimary
      and index_row.indisvalid
  ) then
    raise exception 'profiles must have a valid primary key before using DEFAULT replica identity.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_index as index_row
    join pg_catalog.pg_attribute as attribute_row
      on attribute_row.attrelid = index_row.indrelid
     and attribute_row.attnum = any(index_row.indkey)
    where index_row.indrelid = 'public.conversation_participants'::regclass
      and index_row.indisprimary
      and attribute_row.attname = 'last_read_at'
  ) then
    raise exception 'conversation_participants.last_read_at unexpectedly belongs to the primary key.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_index as index_row
    join pg_catalog.pg_attribute as attribute_row
      on attribute_row.attrelid = index_row.indrelid
     and attribute_row.attnum = any(index_row.indkey)
    where index_row.indrelid = 'public.profiles'::regclass
      and index_row.indisprimary
      and attribute_row.attname in (
        'last_seen_at',
        'active_status_enabled',
        'last_active_enabled',
        'read_receipts_enabled'
      )
  ) then
    raise exception 'A private profile-status column unexpectedly belongs to the primary key.';
  end if;
end;
$$;

-- Blocking originally used FULL so UPDATE payload.old contained the whole row.
-- Current reconciliation uses payload.new plus the stable composite primary key;
-- DELETE invalidates the bounded participant collection without reading old data.
alter table public.conversation_participants replica identity default;
alter table public.profiles replica identity default;

do $$
declare
  v_profile_columns text;
  v_participant_columns text;
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
      and publication_row.puballtables
  ) then
    raise exception 'Privacy-safe column publication requires supabase_realtime not to publish all tables implicitly.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
  ) then
    raise exception 'The expected supabase_realtime publication is unavailable.';
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
      'read_receipts_enabled'
    );

  select pg_catalog.string_agg(pg_catalog.quote_ident(attribute_row.attname), ', ' order by attribute_row.attnum)
  into v_participant_columns
  from pg_catalog.pg_attribute as attribute_row
  where attribute_row.attrelid = 'public.conversation_participants'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and attribute_row.attname <> 'last_read_at';

  if v_profile_columns is null or v_participant_columns is null then
    raise exception 'Privacy-safe Realtime publication columns could not be resolved.';
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

  if exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'conversation_participants'
  ) then
    execute 'alter publication supabase_realtime drop table public.conversation_participants';
  end if;
  execute pg_catalog.format(
    'alter publication supabase_realtime add table public.conversation_participants (%s)',
    v_participant_columns
  );
end;
$$;

commit;

-- Verification after applying:
-- select table_row.relname, table_row.relreplident
-- from pg_catalog.pg_class as table_row
-- where table_row.oid in (
--   'public.conversation_participants'::regclass,
--   'public.profiles'::regclass
-- );
--
-- select
--   index_row.indexrelid::regclass,
--   index_row.indisreplident,
--   index_row.indisprimary
-- from pg_catalog.pg_index as index_row
-- where index_row.indrelid = 'public.conversation_participants'::regclass;
--
-- select publication_table.schemaname, publication_table.tablename, publication_table.attnames
-- from pg_catalog.pg_publication_tables as publication_table
-- where publication_table.pubname = 'supabase_realtime'
--   and publication_table.schemaname = 'public'
--   and publication_table.tablename in ('conversation_participants', 'profiles');
--
-- select
--   has_column_privilege('authenticated', 'public.conversation_participants', 'last_read_at', 'select') as can_read_raw_last_read,
--   has_column_privilege('authenticated', 'public.profiles', 'last_seen_at', 'select') as can_read_raw_last_seen;
