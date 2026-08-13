begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversation_requests') is null
    or pg_catalog.to_regclass('public.profiles') is null
  then
    raise exception 'Disconnect/reconnect requires the existing direct-conversation, request, participant, and profile tables.';
  end if;
end;
$$;

alter table public.conversations
  add column if not exists connection_status text not null default 'accepted'::text;

alter table public.conversations
  drop constraint if exists conversations_connection_status_check;

alter table public.conversations
  add constraint conversations_connection_status_check
  check (connection_status in ('accepted'::text, 'disconnected'::text));

comment on column public.conversations.connection_status is
  'Shared direct-relationship state. Disconnected conversations retain participant-specific readable history but reject new shared interaction.';

create or replace function private.can_send_conversation_message(target_conversation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_user_id uuid;
  v_connection_status text;
  v_pair_key text;
begin
  if v_user_id is null or target_conversation_id is null then
    return false;
  end if;

  select other_participant.user_id
  into v_other_user_id
  from public.conversation_participants as actor_participant
  join public.conversations as conversation_row
    on conversation_row.id = actor_participant.conversation_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = actor_participant.conversation_id
   and other_participant.user_id <> actor_participant.user_id
  where actor_participant.conversation_id = target_conversation_id
    and actor_participant.user_id = v_user_id
    and conversation_row.conversation_type = 'direct'::text
  order by other_participant.user_id
  limit 1;

  if v_other_user_id is null then
    return false;
  end if;

  v_pair_key := least(v_user_id::text, v_other_user_id::text) || ':' || greatest(v_user_id::text, v_other_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select conversation_row.connection_status
  into v_connection_status
  from public.conversations as conversation_row
  join public.conversation_participants as actor_participant
    on actor_participant.conversation_id = conversation_row.id
   and actor_participant.user_id = v_user_id
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text
  for share of conversation_row;

  if v_connection_status is distinct from 'accepted'::text then
    return false;
  end if;

  return private.users_can_interact(v_user_id, v_other_user_id);
end;
$$;

revoke all on function private.can_send_conversation_message(uuid) from public, anon;
grant execute on function private.can_send_conversation_message(uuid) to authenticated;

create or replace function public.disconnect_conversation(target_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_other_user_id uuid;
  v_pair_key text;
  v_connection_status text;
  v_request_available boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;

  select other_participant.user_id
  into v_other_user_id
  from public.conversations as conversation_row
  join public.conversation_participants as actor_participant
    on actor_participant.conversation_id = conversation_row.id
   and actor_participant.user_id = v_actor_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = conversation_row.id
   and other_participant.user_id <> actor_participant.user_id
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text
  order by other_participant.user_id
  limit 1;

  if v_other_user_id is null then
    raise exception using errcode = '42501', message = 'The direct conversation is unavailable.';
  end if;

  v_pair_key := least(v_actor_id::text, v_other_user_id::text) || ':' || greatest(v_actor_id::text, v_other_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select conversation_row.connection_status
  into v_connection_status
  from public.conversations as conversation_row
  join public.conversation_participants as actor_participant
    on actor_participant.conversation_id = conversation_row.id
   and actor_participant.user_id = v_actor_id
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text
  for update of conversation_row;

  if v_connection_status is null then
    raise exception using errcode = '42501', message = 'The direct conversation is unavailable.';
  end if;

  if v_connection_status = 'accepted'::text then
    update public.conversations as conversation_row
    set connection_status = 'disconnected'::text,
        updated_at = pg_catalog.clock_timestamp()
    where conversation_row.id = target_conversation_id;
    v_connection_status := 'disconnected'::text;
  end if;

  select target_profile.message_requests_enabled
         and private.users_can_interact(v_actor_id, v_other_user_id)
  into v_request_available
  from public.profiles as target_profile
  where target_profile.id = v_other_user_id;

  return pg_catalog.jsonb_build_object(
    'conversation_id', target_conversation_id,
    'connection_status', v_connection_status,
    'target_user_id', v_other_user_id,
    'request_available', coalesce(v_request_available, false)
  );
end;
$$;

revoke all on function public.disconnect_conversation(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_conversation(uuid) to authenticated;

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
    conversation_row.connection_status,
    exists (
      select 1
      from public.user_blocks as own_block
      where own_block.blocker_id = auth.uid()
        and own_block.blocked_id = other_participant.user_id
    ),
    private.users_can_interact(auth.uid(), other_participant.user_id),
    conversation_row.connection_status = 'accepted'::text
      and private.users_can_interact(auth.uid(), other_participant.user_id),
    target_profile.message_requests_enabled
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
    conversation_row.connection_status = 'accepted'::text
      and target_profile.active_status_enabled
      and private.users_can_interact(auth.uid(), target_participant.user_id),
    case
      when conversation_row.connection_status = 'accepted'::text
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
  if v_viewer_id is null then
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
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text;

  if v_connection_accepted is null then
    raise exception using errcode = '42501', message = 'The conversation profile is unavailable.';
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
  join auth.users as account_row
    on account_row.id = profile_row.id
  left join public.profile_details as detail_row
    on detail_row.profile_id = profile_row.id
  where profile_row.id = target_profile_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The conversation profile is unavailable.';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_conversation_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_profile(uuid, uuid) to authenticated;

create or replace function public.set_user_blocked(target_user_id uuid, blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_pair_key text;
  v_i_blocked boolean;
  v_interaction_allowed boolean;
  v_connection_accepted boolean;
  v_request_available boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_user_id is null or blocked is null then
    raise exception using errcode = '22023', message = 'A target user and block state are required.';
  end if;
  if target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'You cannot block yourself.';
  end if;
  if not exists (select 1 from public.profiles as target_profile where target_profile.id = target_user_id) then
    raise exception using errcode = '22023', message = 'The selected profile is unavailable.';
  end if;

  v_pair_key := least(v_user_id::text, target_user_id::text) || ':' || greatest(v_user_id::text, target_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  if blocked then
    insert into public.user_blocks as inserted_block (blocker_id, blocked_id)
    values (v_user_id, target_user_id)
    on conflict on constraint user_blocks_pkey do nothing;
  else
    delete from public.user_blocks as block_row
    where block_row.blocker_id = v_user_id
      and block_row.blocked_id = target_user_id;
  end if;

  select exists (
    select 1
    from public.user_blocks as own_block
    where own_block.blocker_id = v_user_id
      and own_block.blocked_id = target_user_id
  ) into v_i_blocked;

  v_interaction_allowed := private.users_can_interact(v_user_id, target_user_id);

  select exists (
    select 1
    from public.conversations as conversation_row
    join public.conversation_participants as first_participant
      on first_participant.conversation_id = conversation_row.id
     and first_participant.user_id = v_user_id
    join public.conversation_participants as second_participant
      on second_participant.conversation_id = conversation_row.id
     and second_participant.user_id = target_user_id
    where conversation_row.conversation_type = 'direct'::text
      and conversation_row.direct_key = v_pair_key
      and conversation_row.connection_status = 'accepted'::text
  ) into v_connection_accepted;

  select target_profile.message_requests_enabled and v_interaction_allowed
  into v_request_available
  from public.profiles as target_profile
  where target_profile.id = target_user_id;

  return pg_catalog.jsonb_build_object(
    'target_user_id', target_user_id,
    'i_blocked', v_i_blocked,
    'interaction_allowed', v_interaction_allowed,
    'messaging_available', v_connection_accepted and v_interaction_allowed,
    'request_available', coalesce(v_request_available, false)
  );
end;
$$;

revoke all on function public.set_user_blocked(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_user_blocked(uuid, boolean) to authenticated;

create or replace function public.create_conversation_request(target_user_id uuid, introduction_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := auth.uid();
  v_introduction text;
  v_pair_key text;
  v_conversation_id uuid;
  v_connection_status text;
  v_target_allows_requests boolean;
  v_request public.conversation_requests%rowtype;
  v_created_new boolean := false;
begin
  if v_sender_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_user_id is null then raise exception using errcode = '22023', message = 'A target user is required.'; end if;
  if target_user_id = v_sender_id then raise exception using errcode = '22023', message = 'You cannot send a conversation request to yourself.'; end if;
  v_introduction := pg_catalog.btrim(introduction_text);
  if v_introduction is null or pg_catalog.char_length(v_introduction) = 0 then raise exception using errcode = '22023', message = 'An introduction is required.'; end if;
  if pg_catalog.char_length(v_introduction) > 500 then raise exception using errcode = '22023', message = 'The introduction must be 500 characters or fewer.'; end if;

  v_pair_key := least(v_sender_id::text, target_user_id::text) || ':' || greatest(v_sender_id::text, target_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select target_profile.message_requests_enabled
  into v_target_allows_requests
  from public.profiles as target_profile
  where target_profile.id = target_user_id
  for share;

  if v_target_allows_requests is null then
    raise exception using errcode = '22023', message = 'The selected profile is unavailable.';
  end if;
  if not private.users_can_interact(v_sender_id, target_user_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this profile.';
  end if;

  select conversation_row.id, conversation_row.connection_status
  into v_conversation_id, v_connection_status
  from public.conversations as conversation_row
  where conversation_row.conversation_type = 'direct'::text
    and conversation_row.direct_key = v_pair_key
  limit 1;

  if v_conversation_id is not null and v_connection_status = 'accepted'::text then
    return pg_catalog.jsonb_build_object(
      'request_id', null,
      'request_status', 'accepted',
      'request_direction', 'existing_conversation',
      'conversation_id', v_conversation_id,
      'created_new', false,
      'introduction', null,
      'created_at', null
    );
  end if;

  select request_row.*
  into v_request
  from public.conversation_requests as request_row
  where request_row.pair_key = v_pair_key
    and request_row.status = 'pending'::text
  order by request_row.created_at
  limit 1;

  if v_request.id is not null then
    return pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'request_status', v_request.status,
      'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end,
      'conversation_id', v_request.conversation_id,
      'created_new', false,
      'introduction', v_request.introduction,
      'created_at', v_request.created_at
    );
  end if;

  if not v_target_allows_requests then
    raise exception using errcode = '42501', message = 'This person is not accepting new conversation requests right now.';
  end if;

  begin
    insert into public.conversation_requests (sender_id, recipient_id, pair_key, introduction)
    values (v_sender_id, target_user_id, v_pair_key, v_introduction)
    returning * into v_request;
    v_created_new := true;
  exception when unique_violation then
    select request_row.*
    into v_request
    from public.conversation_requests as request_row
    where request_row.pair_key = v_pair_key
      and request_row.status = 'pending'::text
    limit 1;
  end;

  if v_request.id is null then
    raise exception using errcode = '40001', message = 'The request could not be created. Please retry.';
  end if;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'request_status', v_request.status,
    'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end,
    'conversation_id', v_request.conversation_id,
    'created_new', v_created_new,
    'introduction', v_request.introduction,
    'created_at', v_request.created_at
  );
end;
$$;

create or replace function public.respond_to_conversation_request(request_id uuid, response_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_responder_id uuid := auth.uid();
  v_action text := pg_catalog.lower(pg_catalog.btrim(response_action));
  v_request public.conversation_requests%rowtype;
  v_conversation_id uuid;
  v_existing_connection_status text;
  v_reconnected boolean := false;
begin
  if v_responder_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if request_id is null then raise exception using errcode = '22023', message = 'A request ID is required.'; end if;
  if v_action is null or v_action not in ('accept'::text, 'decline'::text) then raise exception using errcode = '22023', message = 'The response must be accept or decline.'; end if;

  select request_row.*
  into v_request
  from public.conversation_requests as request_row
  where request_row.id = request_id
    and request_row.recipient_id = v_responder_id
  for update;

  if v_request.id is null then raise exception using errcode = 'P0002', message = 'The conversation request was not found or is unavailable.'; end if;
  if v_request.status <> 'pending'::text then raise exception using errcode = '55000', message = 'This conversation request is no longer pending.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request.pair_key, 0));

  if v_action = 'decline'::text then
    update public.conversation_requests as request_row
    set status = 'declined'::text,
        responded_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where request_row.id = v_request.id;
    return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', 'declined', 'conversation_id', null, 'reconnected', false);
  end if;

  if not private.users_can_interact(v_request.sender_id, v_request.recipient_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this profile.';
  end if;

  select conversation_row.id, conversation_row.connection_status
  into v_conversation_id, v_existing_connection_status
  from public.conversations as conversation_row
  where conversation_row.direct_key = v_request.pair_key
    and conversation_row.conversation_type = 'direct'::text
  limit 1
  for update of conversation_row;

  v_reconnected := v_conversation_id is not null
    and v_existing_connection_status = 'disconnected'::text;

  if v_conversation_id is null then
    insert into public.conversations (conversation_type, direct_key, created_by, connection_status)
    values ('direct'::text, v_request.pair_key, v_request.sender_id, 'accepted'::text)
    on conflict (direct_key) do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select conversation_row.id, conversation_row.connection_status
      into v_conversation_id, v_existing_connection_status
      from public.conversations as conversation_row
      where conversation_row.direct_key = v_request.pair_key
        and conversation_row.conversation_type = 'direct'::text
      limit 1;
      v_reconnected := v_conversation_id is not null
        and v_existing_connection_status = 'disconnected'::text;
    end if;
  end if;

  if v_conversation_id is null then
    raise exception using errcode = '55000', message = 'The direct conversation could not be created.';
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_request.sender_id), (v_conversation_id, v_request.recipient_id)
  on conflict (conversation_id, user_id) do nothing;

  update public.conversations as conversation_row
  set connection_status = 'accepted'::text,
      updated_at = pg_catalog.clock_timestamp()
  where conversation_row.id = v_conversation_id;

  if not v_reconnected then
    insert into public.messages (conversation_id, sender_id, body, source_request_id)
    values (v_conversation_id, v_request.sender_id, v_request.introduction, v_request.id)
    on conflict (source_request_id) do nothing;
  end if;

  update public.conversation_requests as request_row
  set status = 'accepted'::text,
      conversation_id = v_conversation_id,
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where request_row.id = v_request.id;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'request_status', 'accepted',
    'conversation_id', v_conversation_id,
    'reconnected', v_reconnected
  );
end;
$$;

revoke all on function public.create_conversation_request(uuid, text) from public, anon, authenticated;
grant execute on function public.create_conversation_request(uuid, text) to authenticated;
revoke all on function public.respond_to_conversation_request(uuid, text) from public, anon, authenticated;
grant execute on function public.respond_to_conversation_request(uuid, text) to authenticated;

drop policy if exists message_reactions_owner_delete on public.message_reactions;
create policy message_reactions_owner_delete
on public.message_reactions
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages as message_row
    where message_row.id = message_reactions.message_id
      and message_row.is_deleted = false
      and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
      and private.can_send_conversation_message(message_row.conversation_id)
  )
);

notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'conversations' and column_name = 'connection_status';
-- select id, direct_key, connection_status from public.conversations where conversation_type = 'direct' order by updated_at desc limit 20;
-- select * from public.list_conversation_interaction_statuses();
-- select public.disconnect_conversation('<accepted-conversation-id>'::uuid);
-- select has_function_privilege('anon', 'public.disconnect_conversation(uuid)', 'execute') as anon_can_disconnect,
--        has_function_privilege('authenticated', 'public.disconnect_conversation(uuid)', 'execute') as authenticated_can_disconnect;
