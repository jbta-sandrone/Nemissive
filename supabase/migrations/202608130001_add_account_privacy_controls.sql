begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('public.advance_conversation_receipts(uuid,timestamp with time zone,timestamp with time zone)') is null
    or pg_catalog.to_regprocedure('public.get_conversation_profile(uuid,uuid)') is null then
    raise exception 'Privacy controls require the current profile, blocking, conversation, and receipt schema.';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists active_status_enabled boolean not null default true,
  add column if not exists last_active_enabled boolean not null default true,
  add column if not exists read_receipts_enabled boolean not null default true,
  add column if not exists privacy_preferences_revision_at timestamptz;

alter table public.conversation_participants
  add column if not exists receipt_privacy_revision_at timestamptz;

comment on column public.profiles.active_status_enabled is 'Whether accepted, unblocked conversation partners may render this profile as currently active.';
comment on column public.profiles.last_active_enabled is 'Whether accepted, unblocked conversation partners may receive this profile last-seen timestamp.';
comment on column public.profiles.read_receipts_enabled is 'Whether Seen may be shared when both direct participants enable reciprocal read receipts.';
comment on column public.profiles.privacy_preferences_revision_at is 'Non-sensitive Realtime invalidation timestamp advanced whenever account privacy preferences change.';
comment on column public.conversation_participants.receipt_privacy_revision_at is 'Non-sensitive Realtime invalidation timestamp advanced whenever a delivery/read cursor changes.';

create or replace function private.touch_conversation_receipt_privacy_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_delivered_at is distinct from old.last_delivered_at
    or new.last_read_at is distinct from old.last_read_at then
    new.receipt_privacy_revision_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_participants_touch_receipt_privacy_revision on public.conversation_participants;
create trigger conversation_participants_touch_receipt_privacy_revision
before update of last_delivered_at, last_read_at on public.conversation_participants
for each row execute function private.touch_conversation_receipt_privacy_revision();

create or replace function public.get_my_privacy_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select pg_catalog.jsonb_build_object(
    'active_status_enabled', profile_row.active_status_enabled,
    'last_active_enabled', profile_row.last_active_enabled,
    'read_receipts_enabled', profile_row.read_receipts_enabled
  )
  into v_result
  from public.profiles as profile_row
  where profile_row.id = v_user_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
  return v_result;
end;
$$;

create or replace function public.set_privacy_preferences(
  active_status_enabled boolean,
  last_active_enabled boolean,
  read_receipts_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_status_enabled boolean := active_status_enabled;
  v_last_active_enabled boolean := last_active_enabled;
  v_read_receipts_enabled boolean := read_receipts_enabled;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_active_status_enabled is null or v_last_active_enabled is null or v_read_receipts_enabled is null then
    raise exception using errcode = '22004', message = 'Every privacy preference is required.';
  end if;

  update public.profiles as profile_row
  set active_status_enabled = v_active_status_enabled,
      last_active_enabled = v_last_active_enabled,
      read_receipts_enabled = v_read_receipts_enabled,
      privacy_preferences_revision_at = pg_catalog.clock_timestamp()
  where profile_row.id = v_user_id
  returning pg_catalog.jsonb_build_object(
    'active_status_enabled', profile_row.active_status_enabled,
    'last_active_enabled', profile_row.last_active_enabled,
    'read_receipts_enabled', profile_row.read_receipts_enabled
  ) into v_result;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
  return v_result;
end;
$$;

create or replace function public.list_my_conversation_preferences()
returns table (
  conversation_id uuid,
  last_read_at timestamptz,
  muted_until timestamptz,
  is_pinned boolean,
  archived_at timestamptz,
  history_cleared_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    participant.conversation_id,
    participant.last_read_at,
    participant.muted_until,
    participant.is_pinned,
    participant.archived_at,
    participant.history_cleared_at,
    participant.deleted_at
  from public.conversation_participants as participant
  where participant.user_id = auth.uid();
$$;

create or replace function public.list_conversation_presence()
returns table (
  conversation_id uuid,
  profile_id uuid,
  active_status_visible boolean,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    viewer_participant.conversation_id,
    target_participant.user_id,
    target_profile.active_status_enabled and private.users_can_interact(auth.uid(), target_participant.user_id),
    case
      when target_profile.last_active_enabled
        and private.users_can_interact(auth.uid(), target_participant.user_id)
      then target_profile.last_seen_at
      else null::timestamptz
    end
  from public.conversation_participants as viewer_participant
  join public.conversations as conversation_row
    on conversation_row.id = viewer_participant.conversation_id
  join public.conversation_participants as target_participant
    on target_participant.conversation_id = viewer_participant.conversation_id
   and target_participant.user_id <> viewer_participant.user_id
  join public.profiles as target_profile
    on target_profile.id = target_participant.user_id
  where viewer_participant.user_id = auth.uid()
    and conversation_row.conversation_type = 'direct'::text;
$$;

create or replace function public.get_conversation_receipts(target_conversation_id uuid)
returns table (
  conversation_id uuid,
  user_id uuid,
  last_delivered_at timestamptz,
  last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_user_id uuid;
  v_viewer_history_cleared_at timestamptz;
  v_reciprocal_receipts boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22004', message = 'A conversation ID is required.';
  end if;
  select viewer_participant.history_cleared_at
  into v_viewer_history_cleared_at
    from public.conversations as conversation_row
    join public.conversation_participants as viewer_participant
      on viewer_participant.conversation_id = conversation_row.id
    where conversation_row.id = target_conversation_id
      and conversation_row.conversation_type = 'direct'::text
      and viewer_participant.user_id = v_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  select
    other_participant.user_id,
    viewer_profile.read_receipts_enabled and other_profile.read_receipts_enabled
  into v_other_user_id, v_reciprocal_receipts
  from public.conversation_participants as viewer_participant
  join public.profiles as viewer_profile
    on viewer_profile.id = viewer_participant.user_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = viewer_participant.conversation_id
   and other_participant.user_id <> viewer_participant.user_id
  join public.profiles as other_profile
    on other_profile.id = other_participant.user_id
  where viewer_participant.conversation_id = target_conversation_id
    and viewer_participant.user_id = v_user_id
  limit 1;

  v_reciprocal_receipts := coalesce(v_reciprocal_receipts, false)
    and v_other_user_id is not null
    and private.users_can_interact(v_user_id, v_other_user_id);

  return query
  select
    participant.conversation_id,
    participant.user_id,
    case
      when participant.user_id = v_user_id
        or v_viewer_history_cleared_at is null
        or participant.last_delivered_at > v_viewer_history_cleared_at
      then participant.last_delivered_at
      else null::timestamptz
    end,
    case
      when participant.user_id = v_user_id then participant.last_read_at
      when v_reciprocal_receipts
        and (v_viewer_history_cleared_at is null or participant.last_read_at > v_viewer_history_cleared_at)
      then participant.last_read_at
      else null::timestamptz
    end
  from public.conversation_participants as participant
  where participant.conversation_id = target_conversation_id;
end;
$$;

create or replace function public.get_conversation_profile(
  target_conversation_id uuid,
  target_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_viewer_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null or target_profile_id is null then
    raise exception using errcode = '22004', message = 'A conversation and profile are required.';
  end if;
  if not exists (
    select 1
    from public.conversations as conversation_row
    join public.conversation_participants as viewer_participant
      on viewer_participant.conversation_id = conversation_row.id
     and viewer_participant.user_id = v_viewer_id
    join public.conversation_participants as target_participant
      on target_participant.conversation_id = conversation_row.id
     and target_participant.user_id = target_profile_id
    where conversation_row.id = target_conversation_id
      and conversation_row.conversation_type = 'direct'::text
  ) then
    raise exception using errcode = '42501', message = 'The accepted conversation profile is unavailable.';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'avatar_url', profile_row.avatar_url,
    'last_seen_at', case
      when profile_row.last_active_enabled and private.users_can_interact(v_viewer_id, profile_row.id)
      then profile_row.last_seen_at
      else null::timestamptz
    end,
    'active_status_visible', profile_row.active_status_enabled and private.users_can_interact(v_viewer_id, profile_row.id),
    'bio', detail_row.bio,
    'location_text', detail_row.location_text,
    'interests', coalesce(detail_row.interests, '{}'::text[]),
    'birthday_display', case
      when detail_row.birth_date is null or detail_row.birthday_visibility = 'hidden'::text then null::text
      when detail_row.birthday_visibility = 'month_day'::text then '--'::text || pg_catalog.to_char(detail_row.birth_date, 'MM-DD'::text)
      else pg_catalog.to_char(detail_row.birth_date, 'YYYY-MM-DD'::text)
    end,
    'age', case
      when detail_row.birth_date is not null and detail_row.show_age then
        pg_catalog.date_part('year'::text, pg_catalog.age(current_date::timestamp, detail_row.birth_date::timestamp))::integer
      else null::integer
    end,
    'joined_month', pg_catalog.to_char(account_row.created_at, 'YYYY-MM'::text)
  )
  into v_result
  from public.profiles as profile_row
  join auth.users as account_row on account_row.id = profile_row.id
  left join public.profile_details as detail_row on detail_row.profile_id = profile_row.id
  where profile_row.id = target_profile_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The accepted conversation profile is unavailable.';
  end if;
  return v_result;
end;
$$;

revoke select on table public.profiles from public, anon, authenticated;
revoke select (last_seen_at, active_status_enabled, last_active_enabled, read_receipts_enabled) on table public.profiles from public, anon, authenticated;
do $$
declare
  v_columns text;
begin
  select pg_catalog.string_agg(pg_catalog.quote_ident(attribute_row.attname), ', ' order by attribute_row.attnum)
  into v_columns
  from pg_catalog.pg_attribute as attribute_row
  where attribute_row.attrelid = 'public.profiles'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and attribute_row.attname not in ('last_seen_at', 'active_status_enabled', 'last_active_enabled', 'read_receipts_enabled');
  if v_columns is null then raise exception 'No safe profile columns were found.'; end if;
  execute pg_catalog.format('grant select (%s) on table public.profiles to authenticated', v_columns);
end;
$$;

revoke select on table public.conversation_participants from public, anon, authenticated;
revoke select (last_read_at) on table public.conversation_participants from public, anon, authenticated;
do $$
declare
  v_columns text;
begin
  select pg_catalog.string_agg(pg_catalog.quote_ident(attribute_row.attname), ', ' order by attribute_row.attnum)
  into v_columns
  from pg_catalog.pg_attribute as attribute_row
  where attribute_row.attrelid = 'public.conversation_participants'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and attribute_row.attname <> 'last_read_at';
  if v_columns is null then raise exception 'No safe participant columns were found.'; end if;
  execute pg_catalog.format('grant select (%s) on table public.conversation_participants to authenticated', v_columns);
end;
$$;

-- Logical replication bypasses ordinary column grants. Keep the existing shared
-- Realtime tables, but remove raw last-seen/read cursors from their publications.
do $$
declare
  v_profile_columns text;
  v_participant_columns text;
begin
  if exists (
    select 1 from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
      and publication_row.puballtables
  ) then
    raise exception 'Privacy controls require a column-filterable supabase_realtime publication.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
  ) then
    select pg_catalog.string_agg(pg_catalog.quote_ident(attribute_row.attname), ', ' order by attribute_row.attnum)
    into v_profile_columns
    from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.profiles'::regclass
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
      and attribute_row.attname not in ('last_seen_at', 'active_status_enabled', 'last_active_enabled', 'read_receipts_enabled');

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
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = 'profiles'
    ) then
      execute 'alter publication supabase_realtime drop table public.profiles';
    end if;
    execute pg_catalog.format('alter publication supabase_realtime add table public.profiles (%s)', v_profile_columns);

    if exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = 'conversation_participants'
    ) then
      execute 'alter publication supabase_realtime drop table public.conversation_participants';
    end if;
    execute pg_catalog.format('alter publication supabase_realtime add table public.conversation_participants (%s)', v_participant_columns);
  end if;
end;
$$;

revoke all on function public.get_my_privacy_preferences() from public, anon, authenticated;
grant execute on function public.get_my_privacy_preferences() to authenticated;
revoke all on function public.set_privacy_preferences(boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_privacy_preferences(boolean, boolean, boolean) to authenticated;
revoke all on function public.list_my_conversation_preferences() from public, anon, authenticated;
grant execute on function public.list_my_conversation_preferences() to authenticated;
revoke all on function public.list_conversation_presence() from public, anon, authenticated;
grant execute on function public.list_conversation_presence() to authenticated;
revoke all on function public.get_conversation_receipts(uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_receipts(uuid) to authenticated;
revoke all on function public.get_conversation_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_profile(uuid, uuid) to authenticated;

revoke all on function private.touch_conversation_receipt_privacy_revision() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select active_status_enabled, last_active_enabled, read_receipts_enabled from public.get_my_privacy_preferences();
-- select * from public.list_conversation_presence();
-- select * from public.get_conversation_receipts('<accepted-conversation-id>'::uuid);
-- select has_column_privilege('authenticated', 'public.profiles', 'last_seen_at', 'select') as can_read_raw_last_seen,
--        has_column_privilege('authenticated', 'public.conversation_participants', 'last_read_at', 'select') as can_read_raw_last_read;
-- select has_function_privilege('anon', 'public.set_privacy_preferences(boolean,boolean,boolean)', 'execute') as anon_can_set,
--        has_function_privilege('authenticated', 'public.set_privacy_preferences(boolean,boolean,boolean)', 'execute') as authenticated_can_set;
