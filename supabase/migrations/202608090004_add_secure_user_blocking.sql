begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_reactions') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
    or pg_catalog.to_regprocedure('public.create_conversation_request(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.respond_to_conversation_request(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.set_message_pinned(uuid,boolean)') is null
    or pg_catalog.to_regprocedure('public.set_conversation_nickname(uuid,uuid,text)') is null
    or pg_catalog.to_regprocedure('public.set_conversation_theme(uuid,text)') is null then
    raise exception 'Secure user blocking requires the current messaging, pin, nickname, and theme schema.';
  end if;
end;
$$;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_check check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_blocker_idx
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;
revoke all on table public.user_blocks from public, anon, authenticated;

alter table public.conversation_participants
  add column if not exists interaction_updated_at timestamptz;

alter table public.conversation_participants replica identity full;

create or replace function private.users_can_interact(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select first_user_id is not null
    and second_user_id is not null
    and first_user_id <> second_user_id
    and not exists (
      select 1
      from public.user_blocks as block_row
      where (block_row.blocker_id = first_user_id and block_row.blocked_id = second_user_id)
         or (block_row.blocker_id = second_user_id and block_row.blocked_id = first_user_id)
    );
$$;

create or replace function private.can_access_accepted_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants as participant
    join public.conversations as conversation_row
      on conversation_row.id = participant.conversation_id
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
      and conversation_row.conversation_type = 'direct'::text
  );
$$;

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
  return private.users_can_interact(v_user_id, v_other_user_id);
end;
$$;

revoke all on function private.users_can_interact(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_access_accepted_conversation(uuid) from public, anon, authenticated;
revoke all on function private.can_send_conversation_message(uuid) from public, anon;
grant execute on function private.can_send_conversation_message(uuid) to authenticated;

create or replace function private.touch_block_pair_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_user_id uuid := case when tg_op = 'DELETE'::text then old.blocker_id else new.blocker_id end;
  v_second_user_id uuid := case when tg_op = 'DELETE'::text then old.blocked_id else new.blocked_id end;
begin
  update public.conversation_participants as participant
  set interaction_updated_at = pg_catalog.clock_timestamp()
  from public.conversations as conversation_row
  where conversation_row.id = participant.conversation_id
    and conversation_row.conversation_type = 'direct'::text
    and participant.user_id in (v_first_user_id, v_second_user_id)
    and exists (
      select 1
      from public.conversation_participants as counterpart
      where counterpart.conversation_id = participant.conversation_id
        and counterpart.user_id in (v_first_user_id, v_second_user_id)
        and counterpart.user_id <> participant.user_id
    );
  return null;
end;
$$;

drop trigger if exists user_blocks_touch_conversations on public.user_blocks;
create trigger user_blocks_touch_conversations
after insert or delete on public.user_blocks
for each row execute function private.touch_block_pair_conversations();

revoke all on function private.touch_block_pair_conversations() from public, anon, authenticated;

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
  v_messaging_available boolean;
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
    select 1 from public.user_blocks as own_block
    where own_block.blocker_id = v_user_id and own_block.blocked_id = target_user_id
  ) into v_i_blocked;
  v_messaging_available := private.users_can_interact(v_user_id, target_user_id);

  return pg_catalog.jsonb_build_object(
    'target_user_id', target_user_id,
    'i_blocked', v_i_blocked,
    'messaging_available', v_messaging_available
  );
end;
$$;

create or replace function public.list_conversation_interaction_statuses()
returns table (
  conversation_id uuid,
  target_user_id uuid,
  i_blocked boolean,
  messaging_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    actor_participant.conversation_id,
    other_participant.user_id,
    exists (
      select 1 from public.user_blocks as own_block
      where own_block.blocker_id = auth.uid()
        and own_block.blocked_id = other_participant.user_id
    ),
    private.users_can_interact(auth.uid(), other_participant.user_id)
  from public.conversation_participants as actor_participant
  join public.conversations as conversation_row
    on conversation_row.id = actor_participant.conversation_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = actor_participant.conversation_id
   and other_participant.user_id <> actor_participant.user_id
  where actor_participant.user_id = auth.uid()
    and conversation_row.conversation_type = 'direct'::text;
$$;

revoke all on function public.set_user_blocked(uuid, boolean) from public, anon;
grant execute on function public.set_user_blocked(uuid, boolean) to authenticated;
revoke all on function public.list_conversation_interaction_statuses() from public, anon;
grant execute on function public.list_conversation_interaction_statuses() to authenticated;

drop policy if exists messages_participants_insert on public.messages;
create policy messages_participants_insert
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and source_request_id is null
  and message_type = 'text'::text
  and private.can_send_conversation_message(conversation_id)
);

drop policy if exists message_media_participant_insert on storage.objects;
create policy message_media_participant_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-media'
  and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 4
  and pg_catalog.split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.split_part(name, '/', 2) = auth.uid()::text
  and pg_catalog.split_part(name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.split_part(pg_catalog.split_part(name, '/', 4), '.', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in (
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'ogg', 'm4a', 'mp4',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'
  )
  and private.can_send_conversation_message(pg_catalog.split_part(name, '/', 1)::uuid)
);

drop policy if exists message_reactions_participants_insert on public.message_reactions;
create policy message_reactions_participants_insert
on public.message_reactions
for insert
to authenticated
with check (
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
  v_request public.conversation_requests%rowtype;
  v_created_new boolean := false;
begin
  if v_sender_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_user_id is null then raise exception using errcode = '22023', message = 'A target user is required.'; end if;
  if target_user_id = v_sender_id then raise exception using errcode = '22023', message = 'You cannot send a conversation request to yourself.'; end if;
  v_introduction := pg_catalog.btrim(introduction_text);
  if v_introduction is null or pg_catalog.char_length(v_introduction) = 0 then raise exception using errcode = '22023', message = 'An introduction is required.'; end if;
  if pg_catalog.char_length(v_introduction) > 500 then raise exception using errcode = '22023', message = 'The introduction must be 500 characters or fewer.'; end if;
  if not exists (select 1 from public.profiles as target_profile where target_profile.id = target_user_id) then raise exception using errcode = '22023', message = 'The selected profile is unavailable.'; end if;

  v_pair_key := least(v_sender_id::text, target_user_id::text) || ':' || greatest(v_sender_id::text, target_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));
  if not private.users_can_interact(v_sender_id, target_user_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this profile.';
  end if;

  select conversation_row.id into v_conversation_id
  from public.conversations as conversation_row
  where conversation_row.conversation_type = 'direct'::text and conversation_row.direct_key = v_pair_key
  limit 1;
  if v_conversation_id is not null then
    return pg_catalog.jsonb_build_object('request_id', null, 'request_status', 'accepted', 'request_direction', 'existing_conversation', 'conversation_id', v_conversation_id, 'created_new', false, 'introduction', null, 'created_at', null);
  end if;

  select request_row.* into v_request
  from public.conversation_requests as request_row
  where request_row.pair_key = v_pair_key and request_row.status = 'pending'::text
  order by request_row.created_at limit 1;
  if v_request.id is not null then
    return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', v_request.status, 'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end, 'conversation_id', v_request.conversation_id, 'created_new', false, 'introduction', v_request.introduction, 'created_at', v_request.created_at);
  end if;

  begin
    insert into public.conversation_requests (sender_id, recipient_id, pair_key, introduction)
    values (v_sender_id, target_user_id, v_pair_key, v_introduction)
    returning * into v_request;
    v_created_new := true;
  exception when unique_violation then
    select request_row.* into v_request
    from public.conversation_requests as request_row
    where request_row.pair_key = v_pair_key and request_row.status = 'pending'::text limit 1;
  end;
  if v_request.id is null then raise exception using errcode = '40001', message = 'The request could not be created. Please retry.'; end if;
  return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', v_request.status, 'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end, 'conversation_id', v_request.conversation_id, 'created_new', v_created_new, 'introduction', v_request.introduction, 'created_at', v_request.created_at);
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
begin
  if v_responder_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if request_id is null then raise exception using errcode = '22023', message = 'A request ID is required.'; end if;
  if v_action is null or v_action not in ('accept'::text, 'decline'::text) then raise exception using errcode = '22023', message = 'The response must be accept or decline.'; end if;

  select request_row.* into v_request
  from public.conversation_requests as request_row
  where request_row.id = request_id and request_row.recipient_id = v_responder_id
  for update;
  if v_request.id is null then raise exception using errcode = 'P0002', message = 'The conversation request was not found or is unavailable.'; end if;
  if v_request.status <> 'pending'::text then raise exception using errcode = '55000', message = 'This conversation request is no longer pending.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request.pair_key, 0));

  if v_action = 'decline'::text then
    update public.conversation_requests as request_row
    set status = 'declined'::text, responded_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where request_row.id = v_request.id;
    return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', 'declined', 'conversation_id', null);
  end if;
  if not private.users_can_interact(v_request.sender_id, v_request.recipient_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this profile.';
  end if;

  insert into public.conversations (conversation_type, direct_key, created_by)
  values ('direct'::text, v_request.pair_key, v_request.sender_id)
  on conflict (direct_key) do nothing returning id into v_conversation_id;
  if v_conversation_id is null then
    select conversation_row.id into v_conversation_id from public.conversations as conversation_row
    where conversation_row.direct_key = v_request.pair_key and conversation_row.conversation_type = 'direct'::text limit 1;
  end if;
  if v_conversation_id is null then raise exception using errcode = '55000', message = 'The direct conversation could not be created.'; end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_request.sender_id), (v_conversation_id, v_request.recipient_id)
  on conflict (conversation_id, user_id) do nothing;
  insert into public.messages (conversation_id, sender_id, body, source_request_id)
  values (v_conversation_id, v_request.sender_id, v_request.introduction, v_request.id)
  on conflict (source_request_id) do nothing;
  update public.conversation_requests as request_row
  set status = 'accepted'::text, conversation_id = v_conversation_id, responded_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where request_row.id = v_request.id;
  return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', 'accepted', 'conversation_id', v_conversation_id);
end;
$$;

revoke all on function public.create_conversation_request(uuid, text) from public, anon;
grant execute on function public.create_conversation_request(uuid, text) to authenticated;
revoke all on function public.respond_to_conversation_request(uuid, text) from public, anon;
grant execute on function public.respond_to_conversation_request(uuid, text) to authenticated;

create or replace function public.set_message_pinned(target_message_id uuid, pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messages%rowtype;
  v_pin_count integer;
  v_inserted_message_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_message_id is null or pinned is null then raise exception using errcode = '22023', message = 'A message ID and pin state are required.'; end if;
  select message_row.* into v_message from public.messages as message_row where message_row.id = target_message_id for update;
  if v_message.id is null or v_message.is_deleted or v_message.source_request_id is not null
    or v_message.message_type not in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for pinning.';
  end if;
  if not private.can_send_conversation_message(v_message.conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.';
  end if;
  perform 1 from public.conversations as conversation_row where conversation_row.id = v_message.conversation_id for update;
  if not pinned then
    delete from public.pinned_messages as pin_row where pin_row.message_id = v_message.id and pin_row.conversation_id = v_message.conversation_id;
    return false;
  end if;
  if exists (select 1 from public.pinned_messages as pin_row where pin_row.message_id = v_message.id and pin_row.conversation_id = v_message.conversation_id) then return true; end if;
  select pg_catalog.count(*)::integer into v_pin_count from public.pinned_messages as pin_row where pin_row.conversation_id = v_message.conversation_id;
  if v_pin_count >= 50 then raise exception using errcode = '54000', message = 'This conversation already has 50 pinned messages.'; end if;
  insert into public.pinned_messages as inserted_pin (message_id, conversation_id, pinned_by)
  values (v_message.id, v_message.conversation_id, v_user_id)
  on conflict on constraint pinned_messages_pkey do nothing
  returning inserted_pin.message_id into v_inserted_message_id;
  if v_inserted_message_id is not null then
    insert into public.conversation_events (conversation_id, actor_id, event_type, target_message_id)
    values (v_message.conversation_id, v_user_id, 'message_pinned'::text, v_message.id);
  end if;
  return true;
end;
$$;

create or replace function public.set_conversation_nickname(target_conversation_id uuid, target_user_id uuid, nickname_text text)
returns table (conversation_id uuid, user_id uuid, nickname text, updated_by uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_normalized_nickname text;
  v_existing_nickname text;
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or target_user_id is null then raise exception using errcode = '22023', message = 'A conversation and participant are required.'; end if;
  if nickname_text is not null then
    v_normalized_nickname := pg_catalog.btrim(nickname_text);
    if v_normalized_nickname = ''::text then raise exception using errcode = '22023', message = 'A nickname cannot be empty.'; end if;
    if pg_catalog.char_length(v_normalized_nickname) > 40 then raise exception using errcode = '22023', message = 'A nickname must be 40 characters or fewer.'; end if;
    if v_normalized_nickname ~ '[[:cntrl:]]' then raise exception using errcode = '22023', message = 'A nickname contains unsupported control characters.'; end if;
  end if;
  perform 1
  from public.conversation_participants as target_participant
  join public.conversations as conversation_row on conversation_row.id = target_participant.conversation_id
  where target_participant.conversation_id = target_conversation_id
    and target_participant.user_id = target_user_id
    and conversation_row.conversation_type = 'direct'::text
    and exists (select 1 from public.conversation_participants as actor_participant where actor_participant.conversation_id = target_conversation_id and actor_participant.user_id = v_actor_id)
  for update of target_participant;
  if not found then raise exception using errcode = '42501', message = 'The accepted conversation participant is unavailable.'; end if;
  if not private.can_send_conversation_message(target_conversation_id) then raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.'; end if;
  select saved_nickname.nickname into v_existing_nickname from public.conversation_nicknames as saved_nickname
  where saved_nickname.conversation_id = target_conversation_id and saved_nickname.user_id = target_user_id;
  if v_normalized_nickname is not distinct from v_existing_nickname then
    return query select target_conversation_id, target_user_id, v_existing_nickname, v_actor_id, v_changed_at; return;
  end if;
  if v_normalized_nickname is null then
    delete from public.conversation_nicknames as saved_nickname where saved_nickname.conversation_id = target_conversation_id and saved_nickname.user_id = target_user_id;
    if found then insert into public.conversation_events (conversation_id, actor_id, event_type, target_user_id, nickname_value) values (target_conversation_id, v_actor_id, 'nickname_removed'::text, target_user_id, null::text); end if;
  else
    insert into public.conversation_nicknames as inserted_nickname (conversation_id, user_id, nickname, updated_by, updated_at)
    values (target_conversation_id, target_user_id, v_normalized_nickname, v_actor_id, v_changed_at)
    on conflict on constraint conversation_nicknames_pkey do update
      set nickname = v_normalized_nickname, updated_by = v_actor_id, updated_at = v_changed_at;
    insert into public.conversation_events (conversation_id, actor_id, event_type, target_user_id, nickname_value)
    values (target_conversation_id, v_actor_id, 'nickname_changed'::text, target_user_id, v_normalized_nickname);
  end if;
  return query select target_conversation_id, target_user_id, v_normalized_nickname, v_actor_id, v_changed_at;
end;
$$;

create or replace function public.set_conversation_theme(target_conversation_id uuid, theme_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_requested_theme_key text := pg_catalog.btrim(theme_key);
  v_current_theme_key text;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or theme_key is null then raise exception using errcode = '22023', message = 'A conversation and theme are required.'; end if;
  if v_requested_theme_key not in ('default'::text, 'midnight'::text, 'ocean'::text, 'lavender'::text, 'emerald'::text, 'rose'::text, 'sunset'::text) then raise exception using errcode = '22023', message = 'That conversation theme is unavailable.'; end if;
  select conversation_row.theme_key into v_current_theme_key
  from public.conversations as conversation_row
  join public.conversation_participants as actor_participant on actor_participant.conversation_id = conversation_row.id and actor_participant.user_id = v_actor_id
  where conversation_row.id = target_conversation_id and conversation_row.conversation_type = 'direct'::text
  for update of conversation_row;
  if not found then raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.'; end if;
  if not private.can_send_conversation_message(target_conversation_id) then raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.'; end if;
  if v_current_theme_key = v_requested_theme_key then return v_current_theme_key; end if;
  update public.conversations as conversation_row set theme_key = v_requested_theme_key where conversation_row.id = target_conversation_id;
  insert into public.conversation_events (conversation_id, actor_id, event_type, theme_key) values (target_conversation_id, v_actor_id, 'theme_changed'::text, v_requested_theme_key);
  return v_requested_theme_key;
end;
$$;

revoke all on function public.set_message_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;
revoke all on function public.set_conversation_nickname(uuid, uuid, text) from public, anon;
grant execute on function public.set_conversation_nickname(uuid, uuid, text) to authenticated;
revoke all on function public.set_conversation_theme(uuid, text) from public, anon;
grant execute on function public.set_conversation_theme(uuid, text) to authenticated;

drop function if exists public.list_pinned_messages(uuid, integer);
create function public.list_pinned_messages(target_conversation_id uuid, page_size integer default 50)
returns table (
  message_id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz,
  message_type text, pinned_by uuid, pinned_at timestamptz, attachment_count integer,
  voice_duration_ms integer, first_attachment_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_page_size integer := coalesce(page_size, 50::integer);
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or v_page_size not between 1 and 50 then raise exception using errcode = '22023', message = 'A valid conversation and page size are required.'; end if;
  if not private.can_access_accepted_conversation(target_conversation_id) then raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.'; end if;
  return query
  select pin_row.message_id, pin_row.conversation_id, message_row.sender_id, message_row.body, message_row.created_at,
    message_row.message_type, pin_row.pinned_by, pin_row.pinned_at, attachment_totals.attachment_count,
    attachment_totals.voice_duration_ms, attachment_totals.first_attachment_name
  from public.pinned_messages as pin_row
  join public.messages as message_row on message_row.id = pin_row.message_id and message_row.conversation_id = pin_row.conversation_id
  cross join lateral (
    select pg_catalog.count(*)::integer as attachment_count,
      pg_catalog.max(attachment_row.duration_ms) filter (where attachment_row.attachment_kind = 'voice'::text) as voice_duration_ms,
      (pg_catalog.array_agg(attachment_row.original_name order by attachment_row.position))[1] as first_attachment_name
    from public.message_attachments as attachment_row where attachment_row.message_id = message_row.id
  ) as attachment_totals
  where pin_row.conversation_id = target_conversation_id
    and message_row.is_deleted = false
    and message_row.source_request_id is null
    and message_row.message_type in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
    and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
  order by pin_row.pinned_at desc, pin_row.message_id desc limit v_page_size;
end;
$$;

create or replace function public.list_conversation_content(
  target_conversation_id uuid,
  content_kind text,
  page_size integer default 30,
  cursor_created_at timestamptz default null,
  cursor_content_id uuid default null
)
returns table (
  content_id uuid, message_id uuid, sender_id uuid, message_body text, message_created_at timestamptz,
  message_type text, attachment_kind text, storage_path text, original_name text, mime_type text,
  size_bytes bigint, width integer, height integer, attachment_position smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := pg_catalog.lower(pg_catalog.btrim(coalesce(content_kind, ''::text)));
  v_page_size integer := coalesce(page_size, 30::integer);
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or v_kind not in ('media'::text, 'files'::text, 'links'::text) then raise exception using errcode = '22023', message = 'A valid conversation content kind is required.'; end if;
  if v_page_size not between 1 and 50 then raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.'; end if;
  if (cursor_created_at is null) <> (cursor_content_id is null) then raise exception using errcode = '22023', message = 'Both cursor values must be provided together.'; end if;
  if not private.can_access_accepted_conversation(target_conversation_id) then raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.'; end if;
  if v_kind in ('media'::text, 'files'::text) then
    return query
    select attachment_row.id, message_row.id, message_row.sender_id, message_row.body, message_row.created_at,
      message_row.message_type, attachment_row.attachment_kind, attachment_row.storage_path, attachment_row.original_name,
      attachment_row.mime_type, attachment_row.size_bytes, attachment_row.width, attachment_row.height,
      attachment_row.position as attachment_position
    from public.messages as message_row
    join public.message_attachments as attachment_row on attachment_row.message_id = message_row.id
    where message_row.conversation_id = target_conversation_id
      and message_row.is_deleted = false and message_row.source_request_id is null
      and attachment_row.attachment_kind = case when v_kind = 'media'::text then 'image'::text else 'file'::text end
      and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
      and (cursor_created_at is null or (message_row.created_at, attachment_row.id) < (cursor_created_at, cursor_content_id))
    order by message_row.created_at desc, attachment_row.id desc limit v_page_size;
  else
    return query
    select message_row.id, message_row.id, message_row.sender_id, message_row.body, message_row.created_at,
      message_row.message_type, null::text, null::text, null::text, null::text, null::bigint,
      null::integer, null::integer, null::smallint as attachment_position
    from public.messages as message_row
    where message_row.conversation_id = target_conversation_id
      and message_row.is_deleted = false and message_row.source_request_id is null
      and (pg_catalog.strpos(pg_catalog.lower(message_row.body), 'http://'::text) > 0 or pg_catalog.strpos(pg_catalog.lower(message_row.body), 'https://'::text) > 0)
      and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
      and (cursor_created_at is null or (message_row.created_at, message_row.id) < (cursor_created_at, cursor_content_id))
    order by message_row.created_at desc, message_row.id desc limit v_page_size;
  end if;
end;
$$;

revoke all on function public.list_pinned_messages(uuid, integer) from public, anon;
grant execute on function public.list_pinned_messages(uuid, integer) to authenticated;
revoke all on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) to authenticated;

comment on table public.user_blocks is 'Private directional user-level blocks; either direction disables direct interaction.';
comment on column public.conversation_participants.interaction_updated_at is 'Opaque Realtime invalidation timestamp for participant-pair interaction availability changes.';
comment on function public.set_user_blocked(uuid, boolean) is 'Idempotently changes only auth.uid() directional block and returns a privacy-safe interaction status.';
comment on function public.list_conversation_interaction_statuses() is 'Returns caller-scoped direct-conversation i_blocked and neutral messaging_available state without revealing who blocked the caller.';
comment on function private.can_send_conversation_message(uuid) is 'Serializes and authorizes new shared conversation mutations only for accepted direct participants with no block in either direction.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately after applying):
-- select pg_catalog.to_regclass('public.user_blocks') as user_blocks,
--        pg_catalog.to_regprocedure('public.set_user_blocked(uuid,boolean)') as block_rpc,
--        pg_catalog.to_regprocedure('public.list_conversation_interaction_statuses()') as status_rpc;
-- select conname, pg_catalog.pg_get_constraintdef(oid)
-- from pg_catalog.pg_constraint where conrelid = 'public.user_blocks'::regclass order by conname;
-- select has_table_privilege('authenticated', 'public.user_blocks', 'select') as authenticated_can_select_blocks,
--        has_table_privilege('authenticated', 'public.user_blocks', 'insert') as authenticated_can_insert_blocks,
--        has_function_privilege('anon', 'public.set_user_blocked(uuid,boolean)', 'execute') as anon_can_block,
--        has_function_privilege('authenticated', 'public.set_user_blocked(uuid,boolean)', 'execute') as authenticated_can_block;
-- select policyname, cmd, roles, qual, with_check from pg_catalog.pg_policies
-- where (schemaname, tablename) in (('public', 'messages'), ('public', 'message_reactions'), ('storage', 'objects'))
--   and policyname in ('messages_participants_insert', 'message_reactions_participants_insert', 'message_media_participant_insert')
-- order by schemaname, tablename, policyname;
-- select pg_catalog.pg_get_functiondef('private.can_send_conversation_message(uuid)'::regprocedure);
-- select pg_catalog.pg_get_functiondef('public.create_conversation_request(uuid,text)'::regprocedure);
-- select pg_catalog.pg_get_functiondef('public.set_message_pinned(uuid,boolean)'::regprocedure);
-- select pg_catalog.pg_get_functiondef('public.set_conversation_nickname(uuid,uuid,text)'::regprocedure);
-- select pg_catalog.pg_get_functiondef('public.set_conversation_theme(uuid,text)'::regprocedure);
