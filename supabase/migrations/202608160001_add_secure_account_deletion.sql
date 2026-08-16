begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversation_requests') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('storage.objects') is null
  then
    raise exception 'Secure account deletion requires the existing profile, conversation, request, message, and Storage schema.';
  end if;

  if pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('private.is_conversation_participant(uuid)') is null
    or pg_catalog.to_regprocedure('public.search_profiles_for_conversation(text)') is null
  then
    raise exception 'Apply the existing interaction, privacy, and profile identity migrations before secure account deletion.';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists account_status text not null default 'active'::text,
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (
    account_status in ('active'::text, 'deleting'::text, 'deleted'::text)
    and ((account_status = 'active'::text and deleted_at is null) or account_status <> 'active'::text)
  );

alter table public.profiles alter column username drop not null;

comment on column public.profiles.account_status is
  'Application lifecycle status. Only active profiles may authenticate into Nemissive or perform application interactions.';
comment on column public.profiles.deleted_at is
  'Account-deletion lifecycle timestamp. A deleted row is a sanitized shared-history tombstone, not a living profile.';

-- The privacy migration uses explicit column-level profile reads. Make only the
-- non-sensitive lifecycle projection available to authenticated clients.
revoke select (account_status, deleted_at) on public.profiles from public, anon;
grant select (account_status, deleted_at) on public.profiles to authenticated;

-- A profile tombstone must outlive its Auth user. Remove only the profile -> auth.users
-- dependency; account creation remains controlled by the existing Auth signup trigger.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.contype = 'f'
  loop
    execute pg_catalog.format(
      'alter table public.profiles drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

-- Shared-history authorship and membership must reference the durable profile
-- identity, not the removable Auth credential row. Resolve the legacy Auth
-- foreign keys by catalog identity rather than relying on generated names.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conrelid::regclass as table_name,
           constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.conrelid in (
        'public.conversations'::regclass,
        'public.conversation_participants'::regclass,
        'public.conversation_requests'::regclass,
        'public.messages'::regclass,
        'public.message_reactions'::regclass,
        'public.pinned_messages'::regclass,
        'public.conversation_events'::regclass,
        'public.conversation_nicknames'::regclass
      )
  loop
    execute pg_catalog.format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.conversations drop constraint if exists conversations_created_by_profile_fkey;
alter table public.conversations
  add constraint conversations_created_by_profile_fkey
  foreign key (created_by) references public.profiles(id) on delete restrict;

alter table public.conversation_participants drop constraint if exists conversation_participants_user_profile_fkey;
alter table public.conversation_participants
  add constraint conversation_participants_user_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.conversation_requests drop constraint if exists conversation_requests_sender_profile_fkey;
alter table public.conversation_requests drop constraint if exists conversation_requests_recipient_profile_fkey;
alter table public.conversation_requests
  add constraint conversation_requests_sender_profile_fkey
  foreign key (sender_id) references public.profiles(id) on delete restrict;
alter table public.conversation_requests
  add constraint conversation_requests_recipient_profile_fkey
  foreign key (recipient_id) references public.profiles(id) on delete restrict;

alter table public.messages drop constraint if exists messages_sender_profile_fkey;
alter table public.messages
  add constraint messages_sender_profile_fkey
  foreign key (sender_id) references public.profiles(id) on delete restrict;

alter table public.message_reactions drop constraint if exists message_reactions_user_profile_fkey;
alter table public.message_reactions
  add constraint message_reactions_user_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.pinned_messages drop constraint if exists pinned_messages_pinned_by_profile_fkey;
alter table public.pinned_messages
  add constraint pinned_messages_pinned_by_profile_fkey
  foreign key (pinned_by) references public.profiles(id) on delete restrict;

alter table public.conversation_events drop constraint if exists conversation_events_actor_profile_fkey;
alter table public.conversation_events
  add constraint conversation_events_actor_profile_fkey
  foreign key (actor_id) references public.profiles(id) on delete restrict;

alter table public.conversation_nicknames drop constraint if exists conversation_nicknames_updated_by_profile_fkey;
alter table public.conversation_nicknames
  add constraint conversation_nicknames_updated_by_profile_fkey
  foreign key (updated_by) references public.profiles(id) on delete restrict;

create or replace function private.is_active_account(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile_row
    where profile_row.id = target_user_id
      and profile_row.account_status = 'active'::text
  );
$$;

revoke all on function private.is_active_account(uuid) from public, anon, authenticated;
grant execute on function private.is_active_account(uuid) to authenticated;

create or replace function private.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_account(auth.uid())
    and exists (
      select 1
      from public.conversation_participants as participant_row
      where participant_row.conversation_id = target_conversation_id
        and participant_row.user_id = auth.uid()
    );
$$;

revoke all on function private.is_conversation_participant(uuid) from public, anon;
grant execute on function private.is_conversation_participant(uuid) to authenticated;

create or replace function private.can_read_conversation_message(
  target_conversation_id uuid,
  target_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_account(auth.uid())
    and exists (
      select 1
      from public.conversation_participants as participant_row
      join public.conversations as conversation_row
        on conversation_row.id = participant_row.conversation_id
      where participant_row.conversation_id = target_conversation_id
        and participant_row.user_id = auth.uid()
        and conversation_row.conversation_type = 'direct'::text
        and (
          participant_row.history_cleared_at is null
          or target_created_at > participant_row.history_cleared_at
        )
    );
$$;

revoke all on function private.can_read_conversation_message(uuid, timestamptz) from public, anon;
grant execute on function private.can_read_conversation_message(uuid, timestamptz) to authenticated;

create or replace function private.users_can_interact(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    first_user_id is not null
    and second_user_id is not null
    and first_user_id <> second_user_id
    and private.is_active_account(first_user_id)
    and private.is_active_account(second_user_id)
    and not exists (
      select 1
      from public.user_blocks as block_row
      where (block_row.blocker_id = first_user_id and block_row.blocked_id = second_user_id)
         or (block_row.blocker_id = second_user_id and block_row.blocked_id = first_user_id)
    );
$$;

revoke all on function private.users_can_interact(uuid, uuid) from public, anon;
grant execute on function private.users_can_interact(uuid, uuid) to authenticated;

create or replace function private.reject_inactive_authenticated_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is not null and not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'This Nemissive account is no longer active.';
  end if;
  return null;
end;
$$;

revoke all on function private.reject_inactive_authenticated_write() from public, anon, authenticated;

create or replace function private.validate_active_user_block_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_account(new.blocker_id)
    or not private.is_active_account(new.blocked_id)
  then
    raise exception using errcode = '42501', message = 'Blocking is unavailable for an inactive account.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_active_user_block_write() from public, anon, authenticated;

drop trigger if exists validate_active_user_block_write on public.user_blocks;
create trigger validate_active_user_block_write
before insert or update on public.user_blocks
for each row execute function private.validate_active_user_block_write();

create or replace function private.validate_active_connection_status_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and new.connection_status is distinct from old.connection_status
    and exists (
      select 1
      from public.conversation_participants as participant_row
      where participant_row.conversation_id = new.id
        and not private.is_active_account(participant_row.user_id)
    )
  then
    raise exception using errcode = '42501', message = 'Relationship changes are unavailable for a deleted account.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_active_connection_status_write() from public, anon, authenticated;

drop trigger if exists validate_active_connection_status_write on public.conversations;
create trigger validate_active_connection_status_write
before update on public.conversations
for each row execute function private.validate_active_connection_status_write();

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'profiles'::text,
    'profile_details'::text,
    'conversations'::text,
    'conversation_participants'::text,
    'conversation_requests'::text,
    'messages'::text,
    'message_attachments'::text,
    'message_reactions'::text,
    'pinned_messages'::text,
    'conversation_events'::text,
    'conversation_nicknames'::text,
    'user_blocks'::text,
    'request_update_dismissals'::text
  ]
  loop
    execute pg_catalog.format(
      'drop trigger if exists reject_inactive_authenticated_write on public.%I',
      v_table_name
    );
    execute pg_catalog.format(
      'create trigger reject_inactive_authenticated_write before insert or update or delete on public.%I for each statement execute function private.reject_inactive_authenticated_write()',
      v_table_name
    );
  end loop;
end;
$$;

drop policy if exists active_account_select_guard on public.profiles;
create policy active_account_select_guard
on public.profiles
as restrictive
for select
to authenticated
using (private.is_active_account(auth.uid()) or profiles.id = auth.uid());

-- Restrictive policies make active-account state an AND condition for direct
-- Data API reads, preventing an unexpired JWT from reading application rows.
do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'profile_details'::text,
    'conversations'::text,
    'conversation_participants'::text,
    'conversation_requests'::text,
    'messages'::text,
    'message_attachments'::text,
    'message_reactions'::text,
    'pinned_messages'::text,
    'conversation_events'::text,
    'conversation_nicknames'::text,
    'user_blocks'::text,
    'request_update_dismissals'::text
  ]
  loop
    execute pg_catalog.format(
      'drop policy if exists active_account_select_guard on public.%I',
      v_table_name
    );
    execute pg_catalog.format(
      'create policy active_account_select_guard on public.%I as restrictive for select to authenticated using (private.is_active_account(auth.uid()))',
      v_table_name
    );
  end loop;
end;
$$;

drop policy if exists profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  private.is_active_account(auth.uid())
  and bucket_id = 'profile-avatars'::text
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ ('^'::text || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'::text)
);

create or replace function public.search_profiles_for_conversation(search_text text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  request_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_search_text text := nullif(pg_catalog.btrim(search_text), ''::text);
begin
  if v_viewer_id is null or not private.is_active_account(v_viewer_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_search_text is not null and pg_catalog.char_length(v_search_text) > 100 then
    raise exception using errcode = '22023', message = 'Search text must be 100 characters or fewer.';
  end if;

  return query
  select
    profile_row.id,
    profile_row.username,
    profile_row.display_name,
    profile_row.avatar_url,
    profile_row.message_requests_enabled
      and private.users_can_interact(v_viewer_id, profile_row.id)
  from public.profiles as profile_row
  where profile_row.id <> v_viewer_id
    and profile_row.account_status = 'active'::text
    and (
      v_search_text is null
      or (profile_row.username is not null and pg_catalog.strpos(pg_catalog.lower(profile_row.username), pg_catalog.lower(v_search_text)) > 0)
      or (profile_row.display_name is not null and pg_catalog.strpos(pg_catalog.lower(profile_row.display_name), pg_catalog.lower(v_search_text)) > 0)
    )
  order by profile_row.display_name asc nulls last, profile_row.username asc nulls last, profile_row.id
  limit 10;
end;
$$;

revoke all on function public.search_profiles_for_conversation(text) from public, anon, authenticated;
grant execute on function public.search_profiles_for_conversation(text) to authenticated;

drop function if exists public.list_conversation_interaction_statuses();
create function public.list_conversation_interaction_statuses()
returns table (
  conversation_id uuid,
  target_user_id uuid,
  connection_status text,
  i_blocked boolean,
  interaction_allowed boolean,
  messaging_available boolean,
  request_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    actor_participant.conversation_id,
    other_participant.user_id,
    case
      when target_profile.account_status <> 'active'::text then 'deleted'::text
      else conversation_row.connection_status
    end,
    target_profile.account_status = 'active'::text and exists (
      select 1
      from public.user_blocks as own_block
      where own_block.blocker_id = auth.uid()
        and own_block.blocked_id = other_participant.user_id
    ),
    private.users_can_interact(auth.uid(), other_participant.user_id),
    target_profile.account_status = 'active'::text
      and conversation_row.connection_status = 'accepted'::text
      and private.users_can_interact(auth.uid(), other_participant.user_id),
    target_profile.account_status = 'active'::text
      and target_profile.message_requests_enabled
      and private.users_can_interact(auth.uid(), other_participant.user_id)
  from public.conversation_participants as actor_participant
  join public.conversations as conversation_row
    on conversation_row.id = actor_participant.conversation_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = actor_participant.conversation_id
   and other_participant.user_id <> actor_participant.user_id
  join public.profiles as target_profile
    on target_profile.id = other_participant.user_id
  where actor_participant.user_id = auth.uid()
    and private.is_active_account(auth.uid())
    and conversation_row.conversation_type = 'direct'::text;
$$;

revoke all on function public.list_conversation_interaction_statuses() from public, anon, authenticated;
grant execute on function public.list_conversation_interaction_statuses() to authenticated;

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
    target_profile.account_status = 'active'::text
      and conversation_row.connection_status = 'accepted'::text
      and target_profile.active_status_enabled
      and private.users_can_interact(auth.uid(), target_participant.user_id),
    case
      when target_profile.account_status = 'active'::text
        and conversation_row.connection_status = 'accepted'::text
        and target_profile.last_active_enabled
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
    and private.is_active_account(auth.uid())
    and conversation_row.conversation_type = 'direct'::text;
$$;

revoke all on function public.list_conversation_presence() from public, anon, authenticated;
grant execute on function public.list_conversation_presence() to authenticated;

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
  v_connection_accepted boolean;
  v_result jsonb;
begin
  if v_viewer_id is null or not private.is_active_account(v_viewer_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null or target_profile_id is null then
    raise exception using errcode = '22004', message = 'A conversation and profile are required.';
  end if;

  select conversation_row.connection_status = 'accepted'::text
  into v_connection_accepted
  from public.conversations as conversation_row
  join public.conversation_participants as viewer_participant
    on viewer_participant.conversation_id = conversation_row.id
   and viewer_participant.user_id = v_viewer_id
  join public.conversation_participants as target_participant
    on target_participant.conversation_id = conversation_row.id
   and target_participant.user_id = target_profile_id
  join public.profiles as target_profile
    on target_profile.id = target_participant.user_id
   and target_profile.account_status = 'active'::text
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text;

  if v_connection_accepted is null then
    raise exception using errcode = '42501', message = 'This account is no longer available.';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'avatar_url', profile_row.avatar_url,
    'last_seen_at', case
      when v_connection_accepted
        and profile_row.last_active_enabled
        and private.users_can_interact(v_viewer_id, profile_row.id)
      then profile_row.last_seen_at
      else null::timestamptz
    end,
    'active_status_visible', v_connection_accepted
      and profile_row.active_status_enabled
      and private.users_can_interact(v_viewer_id, profile_row.id),
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
  where profile_row.id = target_profile_id
    and profile_row.account_status = 'active'::text;

  if v_result is null then
    raise exception using errcode = '42501', message = 'This account is no longer available.';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_conversation_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_profile(uuid, uuid) to authenticated;

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
    participant_row.conversation_id,
    participant_row.last_read_at,
    participant_row.muted_until,
    participant_row.is_pinned,
    participant_row.archived_at,
    participant_row.history_cleared_at,
    participant_row.deleted_at
  from public.conversation_participants as participant_row
  where participant_row.user_id = auth.uid()
    and private.is_active_account(auth.uid());
$$;

revoke all on function public.list_my_conversation_preferences() from public, anon, authenticated;
grant execute on function public.list_my_conversation_preferences() to authenticated;

create or replace function public.list_blocked_accounts()
returns table (
  blocked_profile_id uuid,
  display_name text,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    blocked_profile.id,
    blocked_profile.display_name,
    blocked_profile.username,
    blocked_profile.avatar_url,
    block_row.created_at
  from public.user_blocks as block_row
  join public.profiles as blocked_profile
    on blocked_profile.id = block_row.blocked_id
   and blocked_profile.account_status = 'active'::text
  where block_row.blocker_id = auth.uid()
    and private.is_active_account(auth.uid())
  order by block_row.created_at desc, blocked_profile.id;
$$;

revoke all on function public.list_blocked_accounts() from public, anon, authenticated;
grant execute on function public.list_blocked_accounts() to authenticated;

create or replace function public.list_request_updates()
returns table (
  id uuid,
  recipient_id uuid,
  status text,
  conversation_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request_row.id,
    request_row.recipient_id,
    request_row.status,
    request_row.conversation_id,
    request_row.created_at,
    request_row.updated_at
  from public.conversation_requests as request_row
  where request_row.sender_id = auth.uid()
    and private.is_active_account(auth.uid())
    and request_row.status in ('accepted'::text, 'declined'::text)
    and not exists (
      select 1
      from public.request_update_dismissals as dismissal_row
      where dismissal_row.user_id = auth.uid()
        and dismissal_row.request_id = request_row.id
    )
  order by request_row.updated_at desc, request_row.id desc
  limit 50;
$$;

revoke all on function public.list_request_updates() from public, anon, authenticated;
grant execute on function public.list_request_updates() to authenticated;

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
  if v_user_id is null or not private.is_active_account(v_user_id) then
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
    participant_row.conversation_id,
    participant_row.user_id,
    case
      when participant_row.user_id = v_user_id
        or v_viewer_history_cleared_at is null
        or participant_row.last_delivered_at > v_viewer_history_cleared_at
      then participant_row.last_delivered_at
      else null::timestamptz
    end,
    case
      when participant_row.user_id = v_user_id then participant_row.last_read_at
      when v_reciprocal_receipts
        and (v_viewer_history_cleared_at is null or participant_row.last_read_at > v_viewer_history_cleared_at)
      then participant_row.last_read_at
      else null::timestamptz
    end
  from public.conversation_participants as participant_row
  where participant_row.conversation_id = target_conversation_id;
end;
$$;

revoke all on function public.get_conversation_receipts(uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_receipts(uuid) to authenticated;

create or replace function public.list_conversation_events(
  target_conversation_id uuid,
  page_size integer default 50
)
returns table (
  event_id uuid,
  conversation_id uuid,
  actor_id uuid,
  event_type text,
  target_message_id uuid,
  target_user_id uuid,
  nickname_value text,
  theme_key text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_page_size integer := coalesce(page_size, 50::integer);
  v_history_cleared_at timestamptz;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;

  select viewer_participant.history_cleared_at
  into v_history_cleared_at
  from public.conversation_participants as viewer_participant
  join public.conversations as conversation_row
    on conversation_row.id = viewer_participant.conversation_id
  where viewer_participant.conversation_id = target_conversation_id
    and viewer_participant.user_id = v_user_id
    and conversation_row.conversation_type = 'direct'::text;

  if not found then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  return query
  select
    event_row.id,
    event_row.conversation_id,
    event_row.actor_id,
    event_row.event_type,
    event_row.target_message_id,
    event_row.target_user_id,
    event_row.nickname_value,
    event_row.theme_key,
    event_row.created_at
  from public.conversation_events as event_row
  where event_row.conversation_id = target_conversation_id
    and (
      (
        event_row.event_type = 'message_pinned'::text
        and exists (
          select 1
          from public.messages as message_row
          where message_row.id = event_row.target_message_id
            and message_row.conversation_id = event_row.conversation_id
            and message_row.is_deleted = false
            and message_row.source_request_id is null
            and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
        )
      )
      or (
        event_row.event_type in (
          'nickname_changed'::text,
          'nickname_removed'::text,
          'theme_changed'::text
        )
        and event_row.created_at > coalesce(v_history_cleared_at, '-infinity'::timestamptz)
      )
    )
  order by event_row.created_at desc, event_row.id desc
  limit v_page_size;
end;
$$;

revoke all on function public.list_conversation_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_conversation_events(uuid, integer) to authenticated;

-- These RPCs are orchestration primitives for the authenticated delete-account
-- Edge Function. They are intentionally unavailable to browser roles.
create or replace function public.begin_account_deletion(target_account_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'An account ID is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_account_id::text, 0));

  select profile_row.account_status
  into v_status
  from public.profiles as profile_row
  where profile_row.id = target_account_id
  for update;

  if v_status is null then
    raise exception using errcode = 'P0002', message = 'The account profile is unavailable.';
  end if;

  if v_status = 'active'::text then
    update public.profiles as profile_row
    set account_status = 'deleting'::text,
        deleted_at = pg_catalog.clock_timestamp(),
        active_status_enabled = false,
        last_active_enabled = false,
        read_receipts_enabled = false,
        message_requests_enabled = false,
        last_seen_at = null,
        privacy_preferences_revision_at = pg_catalog.clock_timestamp()
    where profile_row.id = target_account_id;
    v_status := 'deleting'::text;
  end if;

  return v_status;
end;
$$;

create or replace function public.get_account_deletion_storage_manifest(target_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_retained jsonb;
  v_removable jsonb;
begin
  select profile_row.account_status
  into v_status
  from public.profiles as profile_row
  where profile_row.id = target_account_id;

  if v_status not in ('deleting'::text, 'deleted'::text) then
    raise exception using errcode = '55000', message = 'Account deletion has not started.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'attachment_id', attachment_row.id,
        'bucket_id', object_row.bucket_id,
        'source_path', object_row.name,
        'destination_path', 'retained/'::text || target_account_id::text || '/'::text || attachment_row.id::text || '/'::text || pg_catalog.regexp_replace(object_row.name, '^.*/'::text, ''::text)
      )
      order by object_row.bucket_id, object_row.name
    ),
    '[]'::jsonb
  )
  into v_retained
  from storage.objects as object_row
  join public.message_attachments as attachment_row
    on attachment_row.storage_path = object_row.name
   and object_row.bucket_id = 'message-media'::text
  where object_row.owner_id = target_account_id::text;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bucket_id', object_row.bucket_id,
        'path', object_row.name
      )
      order by object_row.bucket_id, object_row.name
    ),
    '[]'::jsonb
  )
  into v_removable
  from storage.objects as object_row
  where object_row.owner_id = target_account_id::text
    and not (
      object_row.bucket_id = 'message-media'::text
      and exists (
        select 1
        from public.message_attachments as attachment_row
        where attachment_row.storage_path = object_row.name
      )
    );

  return pg_catalog.jsonb_build_object(
    'account_status', v_status,
    'retained_attachments', v_retained,
    'removable_objects', v_removable
  );
end;
$$;

create or replace function public.retarget_account_message_attachment(
  target_account_id uuid,
  target_attachment_id uuid,
  expected_source_path text,
  retained_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
begin
  if target_account_id is null
    or target_attachment_id is null
    or expected_source_path is null
    or retained_storage_path is null
  then
    raise exception using errcode = '22023', message = 'A complete attachment retention request is required.';
  end if;

  if not exists (
    select 1
    from public.profiles as profile_row
    where profile_row.id = target_account_id
      and profile_row.account_status in ('deleting'::text, 'deleted'::text)
  ) then
    raise exception using errcode = '55000', message = 'Account deletion has not started.';
  end if;

  if not exists (
    select 1
    from storage.objects as object_row
    where object_row.bucket_id = 'message-media'::text
      and object_row.name = retained_storage_path
      and object_row.owner_id is null
  ) then
    raise exception using errcode = '55000', message = 'The retained Storage object is unavailable or still user-owned.';
  end if;

  update public.message_attachments as attachment_row
  set storage_path = retained_storage_path
  from public.messages as message_row
  where attachment_row.id = target_attachment_id
    and attachment_row.message_id = message_row.id
    and message_row.sender_id = target_account_id
    and attachment_row.storage_path = expected_source_path
  returning attachment_row.id into v_updated_id;

  if v_updated_id is null then
    raise exception using errcode = 'P0002', message = 'The account attachment could not be retained.';
  end if;

  return true;
end;
$$;

create or replace function public.prepare_account_deletion(target_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'An account ID is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_account_id::text, 0));

  select profile_row.account_status
  into v_status
  from public.profiles as profile_row
  where profile_row.id = target_account_id
  for update;

  if v_status is null then
    raise exception using errcode = 'P0002', message = 'The account profile is unavailable.';
  end if;
  if v_status not in ('deleting'::text, 'deleted'::text) then
    raise exception using errcode = '55000', message = 'Account deletion has not started.';
  end if;

  if exists (
    select 1
    from storage.objects as object_row
    where object_row.owner_id = target_account_id::text
  ) then
    raise exception using errcode = '55000', message = 'Owned Storage objects remain and must be resolved before Auth deletion.';
  end if;

  delete from public.profile_details as detail_row
  where detail_row.profile_id = target_account_id;

  delete from public.user_blocks as block_row
  where block_row.blocker_id = target_account_id
     or block_row.blocked_id = target_account_id;

  delete from public.request_update_dismissals as dismissal_row
  where dismissal_row.user_id = target_account_id;

  delete from public.conversation_requests as request_row
  where request_row.status = 'pending'::text
    and (request_row.sender_id = target_account_id or request_row.recipient_id = target_account_id);

  update public.conversation_participants as participant_row
  set last_delivered_at = null,
      last_read_at = null,
      muted_until = null,
      is_pinned = false,
      archived_at = null,
      history_cleared_at = null,
      deleted_at = null,
      interaction_updated_at = pg_catalog.clock_timestamp(),
      receipt_privacy_revision_at = pg_catalog.clock_timestamp()
  where participant_row.user_id = target_account_id;

  update public.profiles as profile_row
  set account_status = 'deleting'::text,
      deleted_at = coalesce(profile_row.deleted_at, pg_catalog.clock_timestamp()),
      username = null,
      display_name = 'Deleted User'::text,
      avatar_url = null,
      quick_reactions = null,
      browser_notifications_enabled = false,
      notification_sound_enabled = false,
      last_seen_at = null,
      active_status_enabled = false,
      last_active_enabled = false,
      read_receipts_enabled = false,
      message_requests_enabled = false,
      privacy_preferences_revision_at = pg_catalog.clock_timestamp()
  where profile_row.id = target_account_id;

  return true;
end;
$$;

create or replace function public.complete_account_deletion(target_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'An account ID is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_account_id::text, 0));

  if exists (
    select 1
    from auth.users as account_row
    where account_row.id = target_account_id
  ) then
    raise exception using errcode = '55000', message = 'The Auth credential still exists.';
  end if;

  update public.profiles as profile_row
  set account_status = 'deleted'::text,
      deleted_at = coalesce(profile_row.deleted_at, pg_catalog.clock_timestamp())
  where profile_row.id = target_account_id
    and profile_row.account_status = 'deleting'::text;

  if not found and not exists (
    select 1
    from public.profiles as profile_row
    where profile_row.id = target_account_id
      and profile_row.account_status = 'deleted'::text
  ) then
    raise exception using errcode = 'P0002', message = 'The account tombstone is unavailable.';
  end if;

  return true;
end;
$$;

revoke all on function public.begin_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.get_account_deletion_storage_manifest(uuid) from public, anon, authenticated;
revoke all on function public.retarget_account_message_attachment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;
grant execute on function public.get_account_deletion_storage_manifest(uuid) to service_role;
grant execute on function public.retarget_account_message_attachment(uuid, uuid, text, text) to service_role;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.complete_account_deletion(uuid) to service_role;

-- Keep the existing privacy-safe profile publication contract while adding the
-- lifecycle columns required for cross-participant tombstone reconciliation.
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

-- Verification after applying (run as an administrative SQL role):
-- select column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('account_status', 'deleted_at', 'username');
--
-- select constraint_row.conrelid::regclass as table_name,
--        constraint_row.conname,
--        constraint_row.confrelid::regclass as referenced_table,
--        pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
-- from pg_catalog.pg_constraint as constraint_row
-- where constraint_row.contype = 'f'
--   and constraint_row.conrelid in (
--     'public.profiles'::regclass,
--     'public.conversations'::regclass,
--     'public.conversation_participants'::regclass,
--     'public.conversation_requests'::regclass,
--     'public.messages'::regclass,
--     'public.message_reactions'::regclass,
--     'public.pinned_messages'::regclass,
--     'public.conversation_events'::regclass,
--     'public.conversation_nicknames'::regclass,
--     'public.request_update_dismissals'::regclass
--   )
-- order by 1::text, constraint_row.conname;
--
-- select has_function_privilege('authenticated', 'public.begin_account_deletion(uuid)', 'execute') as browser_can_begin,
--        has_function_privilege('service_role', 'public.begin_account_deletion(uuid)', 'execute') as service_can_begin,
--        has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'execute') as browser_can_prepare,
--        has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'execute') as service_can_prepare,
--        has_function_privilege('authenticated', 'public.complete_account_deletion(uuid)', 'execute') as browser_can_complete,
--        has_function_privilege('service_role', 'public.complete_account_deletion(uuid)', 'execute') as service_can_complete;
--
-- select publication_table.attnames
-- from pg_catalog.pg_publication_tables as publication_table
-- where publication_table.pubname = 'supabase_realtime'
--   and publication_table.schemaname = 'public'
--   and publication_table.tablename = 'profiles';
