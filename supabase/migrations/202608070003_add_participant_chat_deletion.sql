begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_requests') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_reactions') is null
    or pg_catalog.to_regclass('public.message_attachments') is null
    or pg_catalog.to_regclass('storage.objects') is null then
    raise exception 'Delete chat requires the current conversation, messaging, reactions, and private media migrations.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_participants'
      and column_name in ('is_pinned', 'archived_at', 'muted_until', 'last_read_at', 'last_delivered_at')
    group by table_schema, table_name
    having pg_catalog.count(*) = 5
  ) then
    raise exception 'Delete chat requires the pinned, archived, mute, and receipt participant fields.';
  end if;
end;
$$;

alter table public.conversation_participants
  add column if not exists history_cleared_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

comment on column public.conversation_participants.history_cleared_at is 'Participant-specific permanent cutoff; messages at or before this timestamp are inaccessible to this participant.';
comment on column public.conversation_participants.deleted_at is 'Participant-specific inbox-hidden state, cleared only when another participant sends a new confirmed message.';

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
  select exists (
    select 1
    from public.conversation_participants as participant
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
      and participant.deleted_at is null
      and (
        participant.history_cleared_at is null
        or target_created_at > participant.history_cleared_at
      )
  );
$$;

create or replace function private.can_send_conversation_message(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants as participant
    join public.conversations as conversation on conversation.id = participant.conversation_id
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
      and participant.deleted_at is null
      and conversation.conversation_type = 'direct'::text
  );
$$;

revoke all on function private.can_read_conversation_message(uuid, timestamptz) from public;
revoke all on function private.can_read_conversation_message(uuid, timestamptz) from anon;
grant execute on function private.can_read_conversation_message(uuid, timestamptz) to authenticated;

revoke all on function private.can_send_conversation_message(uuid) from public;
revoke all on function private.can_send_conversation_message(uuid) from anon;
grant execute on function private.can_send_conversation_message(uuid) to authenticated;

create or replace function public.delete_conversation_for_me(target_conversation_id uuid)
returns table (
  history_cleared_at timestamptz,
  deleted_at timestamptz,
  archived_at timestamptz,
  is_pinned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null then
    raise exception using errcode = '22004', message = 'A conversation is required.';
  end if;

  return query
  update public.conversation_participants as participant
  set history_cleared_at = case when participant.deleted_at is null then v_now else coalesce(participant.history_cleared_at, participant.deleted_at, v_now) end,
      deleted_at = coalesce(participant.deleted_at, v_now),
      archived_at = null,
      is_pinned = false
  from public.conversations as conversation
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
    and conversation.id = participant.conversation_id
    and conversation.conversation_type = 'direct'::text
  returning participant.history_cleared_at, participant.deleted_at, participant.archived_at, participant.is_pinned;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;
end;
$$;

revoke all on function public.delete_conversation_for_me(uuid) from public;
revoke all on function public.delete_conversation_for_me(uuid) from anon;
grant execute on function public.delete_conversation_for_me(uuid) to authenticated;

create or replace function private.enforce_deleted_participant_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and (new.archived_at is not null or new.is_pinned) then
    raise exception using errcode = '23514', message = 'Deleted conversations cannot be archived or pinned.';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_participants_enforce_deleted_preferences on public.conversation_participants;
create trigger conversation_participants_enforce_deleted_preferences
before insert or update on public.conversation_participants
for each row
execute function private.enforce_deleted_participant_preferences();

revoke all on function private.enforce_deleted_participant_preferences() from public;
revoke all on function private.enforce_deleted_participant_preferences() from anon;
revoke all on function private.enforce_deleted_participant_preferences() from authenticated;

create or replace function private.unarchive_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants as participant
  set archived_at = null,
      deleted_at = null
  from public.conversations as conversation
  where participant.conversation_id = new.conversation_id
    and participant.user_id <> new.sender_id
    and (participant.archived_at is not null or participant.deleted_at is not null)
    and conversation.id = participant.conversation_id
    and conversation.conversation_type = 'direct'::text
    and exists (
      select 1
      from public.conversation_participants as sender_participant
      where sender_participant.conversation_id = new.conversation_id
        and sender_participant.user_id = new.sender_id
    );

  return new;
end;
$$;

create or replace function private.prevent_deleted_participant_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.conversation_participants as participant
    where participant.conversation_id = new.conversation_id
      and participant.user_id = new.sender_id
      and participant.deleted_at is not null
  ) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_prevent_deleted_participant_insert on public.messages;
create trigger messages_prevent_deleted_participant_insert
before insert on public.messages
for each row
execute function private.prevent_deleted_participant_message_insert();

revoke all on function private.prevent_deleted_participant_message_insert() from public;
revoke all on function private.prevent_deleted_participant_message_insert() from anon;
revoke all on function private.prevent_deleted_participant_message_insert() from authenticated;

create or replace function private.validate_message_reply_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.messages as reply_target
    where reply_target.id = new.reply_to_message_id
      and reply_target.conversation_id = new.conversation_id
      and reply_target.is_deleted = false
      and private.can_read_conversation_message(reply_target.conversation_id, reply_target.created_at)
  ) then
    raise exception using errcode = '23514', message = 'The reply target is unavailable in this conversation.';
  end if;

  return new;
end;
$$;

drop policy if exists messages_participants_select on public.messages;
create policy messages_participants_select
on public.messages
for select
to authenticated
using (private.can_read_conversation_message(conversation_id, created_at));

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

drop policy if exists conversation_requests_members_select on public.conversation_requests;
create policy conversation_requests_members_select
on public.conversation_requests
for select
to authenticated
using (
  (auth.uid() = sender_id or auth.uid() = recipient_id)
  and (
    status <> 'accepted'::text
    or conversation_id is null
    or exists (
      select 1
      from public.conversation_participants as participant
      where participant.conversation_id = conversation_requests.conversation_id
        and participant.user_id = auth.uid()
        and participant.deleted_at is null
        and (
          participant.history_cleared_at is null
          or conversation_requests.created_at > participant.history_cleared_at
        )
    )
  )
);

drop policy if exists message_attachments_participants_select on public.message_attachments;
create policy message_attachments_participants_select
on public.message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = message_attachments.message_id
      and message.is_deleted = false
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  )
);

drop policy if exists message_reactions_participants_select on public.message_reactions;
create policy message_reactions_participants_select
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and message.is_deleted = false
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  )
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
    from public.messages as message
    where message.id = message_reactions.message_id
      and message.is_deleted = false
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  )
);

drop policy if exists message_reactions_owner_delete on public.message_reactions;
create policy message_reactions_owner_delete
on public.message_reactions
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and message.is_deleted = false
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  )
);

create or replace function private.can_read_message_media(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_attachments as attachment
    join public.messages as message on message.id = attachment.message_id
    where attachment.storage_path = target_storage_path
      and message.is_deleted = false
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  );
$$;

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
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in ('png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'ogg', 'm4a', 'mp4')
  and private.can_send_conversation_message(pg_catalog.split_part(name, '/', 1)::uuid)
);

create or replace function public.search_messages(
  search_text text,
  page_size integer default 30,
  cursor_created_at timestamptz default null,
  cursor_message_id uuid default null,
  sender_filter uuid default null,
  image_only boolean default false,
  date_from timestamptz default null,
  date_to timestamptz default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_username text,
  sender_avatar_url text,
  other_user_id uuid,
  other_display_name text,
  other_username text,
  other_avatar_url text,
  message_type text,
  snippet text,
  created_at timestamptz,
  edited_at timestamptz,
  attachment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_search_text text := pg_catalog.btrim(coalesce(search_text, ''::text));
  v_page_size integer := coalesce(page_size, 30::integer);
  v_image_only boolean := coalesce(image_only, false::boolean);
  v_tsquery tsquery;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if pg_catalog.char_length(v_search_text) > 200 then
    raise exception using errcode = '22023', message = 'Search text must be 200 characters or fewer.';
  end if;
  if pg_catalog.char_length(v_search_text) < 2 and not (v_image_only and v_search_text = ''::text) then
    raise exception using errcode = '22023', message = 'Enter at least two characters to search messages.';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;
  if (cursor_created_at is null) <> (cursor_message_id is null) then
    raise exception using errcode = '22023', message = 'Both cursor values must be provided together.';
  end if;
  if date_from is not null and date_to is not null and date_from >= date_to then
    raise exception using errcode = '22023', message = 'The date range is invalid.';
  end if;
  if v_search_text <> ''::text then
    v_tsquery := pg_catalog.websearch_to_tsquery('simple'::regconfig, v_search_text);
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    sender_profile.display_name,
    sender_profile.username,
    sender_profile.avatar_url,
    other_participant.user_id,
    other_profile.display_name,
    other_profile.username,
    other_profile.avatar_url,
    message.message_type,
    case
      when message.message_type = 'image'::text and message.body = ''::text then case when attachment_totals.attachment_count = 1 then 'Photo'::text else 'Photos'::text end
      else pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(message.body), '[[:space:]]+'::text, ' '::text, 'g'::text), 160)
    end,
    message.created_at,
    message.edited_at,
    attachment_totals.attachment_count
  from public.messages as message
  join public.conversations as conversation on conversation.id = message.conversation_id and conversation.conversation_type = 'direct'::text
  join public.conversation_participants as caller_participant on caller_participant.conversation_id = message.conversation_id and caller_participant.user_id = v_user_id
  join public.conversation_participants as other_participant on other_participant.conversation_id = message.conversation_id and other_participant.user_id <> v_user_id
  join public.profiles as sender_profile on sender_profile.id = message.sender_id
  join public.profiles as other_profile on other_profile.id = other_participant.user_id
  cross join lateral (
    select pg_catalog.count(*)::bigint as attachment_count
    from public.message_attachments as attachment
    where attachment.message_id = message.id
  ) as attachment_totals
  where caller_participant.deleted_at is null
    and (caller_participant.history_cleared_at is null or message.created_at > caller_participant.history_cleared_at)
    and message.is_deleted = false
    and (sender_filter is null or message.sender_id = sender_filter)
    and (not v_image_only or message.message_type = 'image'::text)
    and (date_from is null or message.created_at >= date_from)
    and (date_to is null or message.created_at < date_to)
    and (
      (v_search_text = ''::text and v_image_only)
      or (
        v_search_text <> ''::text
        and (
          (v_tsquery::text <> ''::text and pg_catalog.to_tsvector('simple'::regconfig, message.body) @@ v_tsquery)
          or (v_tsquery::text = ''::text and pg_catalog.strpos(pg_catalog.lower(message.body), pg_catalog.lower(v_search_text)) > 0)
        )
      )
    )
    and (cursor_created_at is null or (message.created_at, message.id) < (cursor_created_at, cursor_message_id))
  order by message.created_at desc, message.id desc
  limit v_page_size;
end;
$$;

create or replace function public.load_message_context(
  target_message_id uuid,
  before_count integer default 20,
  after_count integer default 20
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  is_deleted boolean,
  deleted_at timestamptz,
  source_request_id uuid,
  message_type text,
  reply_to_message_id uuid,
  attachment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target record;
  v_before_count integer := coalesce(before_count, 20::integer);
  v_after_count integer := coalesce(after_count, 20::integer);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_message_id is null then
    raise exception using errcode = '22023', message = 'A target message is required.';
  end if;
  if v_before_count < 0 or v_before_count > 50 or v_after_count < 0 or v_after_count > 50 then
    raise exception using errcode = '22023', message = 'Context counts must be between 0 and 50.';
  end if;

  select message.*, participant.history_cleared_at as participant_history_cleared_at
  into v_target
  from public.messages as message
  join public.conversations as conversation on conversation.id = message.conversation_id and conversation.conversation_type = 'direct'::text
  join public.conversation_participants as participant on participant.conversation_id = message.conversation_id and participant.user_id = v_user_id
  where message.id = target_message_id
    and participant.deleted_at is null
    and (participant.history_cleared_at is null or message.created_at > participant.history_cleared_at);

  if not found then
    raise exception using errcode = '42501', message = 'The message is unavailable.';
  end if;

  return query
  with older_messages as (
    select message.*
    from public.messages as message
    where message.conversation_id = v_target.conversation_id
      and (v_target.participant_history_cleared_at is null or message.created_at > v_target.participant_history_cleared_at)
      and (message.created_at, message.id) < (v_target.created_at, v_target.id)
    order by message.created_at desc, message.id desc
    limit v_before_count
  ), newer_messages as (
    select message.*
    from public.messages as message
    where message.conversation_id = v_target.conversation_id
      and (v_target.participant_history_cleared_at is null or message.created_at > v_target.participant_history_cleared_at)
      and (message.created_at, message.id) > (v_target.created_at, v_target.id)
    order by message.created_at asc, message.id asc
    limit v_after_count
  ), context_messages as (
    select * from older_messages
    union all
    select * from public.messages as message where message.id = v_target.id
    union all
    select * from newer_messages
  )
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    case when message.is_deleted then ''::text else message.body end,
    message.created_at,
    message.edited_at,
    message.is_deleted,
    message.deleted_at,
    message.source_request_id,
    message.message_type,
    message.reply_to_message_id,
    (
      select pg_catalog.count(*)::bigint
      from public.message_attachments as attachment
      where attachment.message_id = message.id and message.is_deleted = false
    )
  from context_messages as message
  order by message.created_at asc, message.id asc;
end;
$$;

create or replace function public.edit_message(target_message_id uuid, new_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := pg_catalog.btrim(coalesce(new_body, ''::text));
  v_message public.messages%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_message_id is null then raise exception using errcode = '22023', message = 'A message ID is required.'; end if;

  select message.* into v_message
  from public.messages as message
  where message.id = target_message_id and message.sender_id = v_user_id
  for update;

  if v_message.id is null or v_message.is_deleted or v_message.source_request_id is not null or v_message.message_type = 'voice'::text
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for editing.';
  end if;
  if (v_message.message_type = 'text'::text and pg_catalog.char_length(v_body) = 0) or pg_catalog.char_length(v_body) > 2000 then
    raise exception using errcode = '22023', message = 'A message must contain no more than 2,000 characters.';
  end if;
  if v_body = v_message.body then return v_message; end if;

  update public.messages as message set body = v_body, edited_at = pg_catalog.now()
  where message.id = v_message.id and message.is_deleted = false
  returning message.* into v_message;
  return v_message;
end;
$$;

create or replace function public.delete_message(target_message_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messages%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_message_id is null then raise exception using errcode = '22023', message = 'A message ID is required.'; end if;

  select message.* into v_message
  from public.messages as message
  where message.id = target_message_id and message.sender_id = v_user_id
  for update;

  if v_message.id is null or v_message.source_request_id is not null
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for deletion.';
  end if;
  if v_message.is_deleted then return v_message; end if;

  update public.messages as message
  set body = ''::text, is_deleted = true, deleted_at = pg_catalog.now()
  where message.id = v_message.id and message.is_deleted = false
  returning message.* into v_message;
  return v_message;
end;
$$;

do $$
begin
  if pg_catalog.to_regprocedure('public.create_image_message_internal(uuid,uuid,text,uuid,jsonb)') is null then
    if pg_catalog.to_regprocedure('public.create_image_message(uuid,uuid,text,uuid,jsonb)') is null then
      raise exception 'create_image_message RPC is missing.';
    end if;
    alter function public.create_image_message(uuid, uuid, text, uuid, jsonb) rename to create_image_message_internal;
  end if;

  if pg_catalog.to_regprocedure('public.create_voice_message_internal(uuid,uuid,uuid,jsonb)') is null then
    if pg_catalog.to_regprocedure('public.create_voice_message(uuid,uuid,uuid,jsonb)') is null then
      raise exception 'create_voice_message RPC is missing.';
    end if;
    alter function public.create_voice_message(uuid, uuid, uuid, jsonb) rename to create_voice_message_internal;
  end if;
end;
$$;

revoke all on function public.create_image_message_internal(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.create_image_message_internal(uuid, uuid, text, uuid, jsonb) from anon;
revoke all on function public.create_image_message_internal(uuid, uuid, text, uuid, jsonb) from authenticated;

revoke all on function public.create_voice_message_internal(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.create_voice_message_internal(uuid, uuid, uuid, jsonb) from anon;
revoke all on function public.create_voice_message_internal(uuid, uuid, uuid, jsonb) from authenticated;

create or replace function public.create_image_message(
  target_message_id uuid,
  target_conversation_id uuid,
  caption_text text,
  target_reply_to_message_id uuid,
  attachment_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.messages%rowtype;
begin
  if not private.can_send_conversation_message(target_conversation_id) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;
  select message.* into v_existing from public.messages as message where message.id = target_message_id;
  if v_existing.id is not null and not private.can_read_conversation_message(v_existing.conversation_id, v_existing.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable.';
  end if;
  return public.create_image_message_internal(target_message_id, target_conversation_id, caption_text, target_reply_to_message_id, attachment_records);
end;
$$;

create or replace function public.create_voice_message(
  target_message_id uuid,
  target_conversation_id uuid,
  target_reply_to_message_id uuid,
  attachment_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.messages%rowtype;
begin
  if not private.can_send_conversation_message(target_conversation_id) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;
  select message.* into v_existing from public.messages as message where message.id = target_message_id;
  if v_existing.id is not null and not private.can_read_conversation_message(v_existing.conversation_id, v_existing.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable.';
  end if;
  return public.create_voice_message_internal(target_message_id, target_conversation_id, target_reply_to_message_id, attachment_record);
end;
$$;

revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.create_image_message(uuid, uuid, text, uuid, jsonb) to authenticated;

revoke all on function public.create_voice_message(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.create_voice_message(uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.create_voice_message(uuid, uuid, uuid, jsonb) to authenticated;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

revoke all on function public.delete_message(uuid) from public;
revoke all on function public.delete_message(uuid) from anon;
grant execute on function public.delete_message(uuid) to authenticated;

revoke all on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) from public;
revoke all on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) from anon;
grant execute on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) to authenticated;

revoke all on function public.load_message_context(uuid, integer, integer) from public;
revoke all on function public.load_message_context(uuid, integer, integer) from anon;
grant execute on function public.load_message_context(uuid, integer, integer) to authenticated;

comment on function public.delete_conversation_for_me(uuid) is 'Privately hides an accepted conversation and permanently advances only auth.uid() history cutoff.';
comment on function private.can_read_conversation_message(uuid, timestamptz) is 'Authorizes one message timestamp against auth.uid() participant deletion and history cutoff state.';
comment on function private.can_send_conversation_message(uuid) is 'Authorizes sending only while auth.uid() participant conversation state is active.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'conversation_participants'
--   and column_name in ('history_cleared_at', 'deleted_at')
-- order by column_name;
--
-- select pg_catalog.to_regprocedure('public.delete_conversation_for_me(uuid)') as delete_chat_rpc,
--        has_function_privilege('anon', 'public.delete_conversation_for_me(uuid)', 'execute') as anon_can_execute,
--        has_function_privilege('authenticated', 'public.delete_conversation_for_me(uuid)', 'execute') as authenticated_can_execute,
--        has_table_privilege('authenticated', 'public.conversation_participants', 'update') as authenticated_has_direct_update;
--
-- select trigger_name, event_manipulation, action_timing
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table in ('messages', 'conversation_participants')
--   and trigger_name in ('messages_unarchive_recipients', 'messages_prevent_deleted_participant_insert', 'conversation_participants_enforce_deleted_preferences')
-- order by event_object_table, trigger_name;
--
-- select policyname, tablename, cmd
-- from pg_catalog.pg_policies
-- where schemaname = 'public'
--   and tablename in ('messages', 'message_attachments', 'message_reactions', 'conversation_requests')
-- order by tablename, policyname;
