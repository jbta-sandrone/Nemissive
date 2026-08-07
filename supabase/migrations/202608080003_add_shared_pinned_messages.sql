begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_attachments') is null then
    raise exception 'Shared pinned messages require the current conversation, message, and attachment schema.';
  end if;

  if pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('public.delete_message(uuid)') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'conversation_participants'
        and column_name = 'history_cleared_at'
    ) then
    raise exception 'Apply the participant Delete Chat migrations before shared pinned messages.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_id_conversation_id_key'
  ) then
    alter table public.messages
      add constraint messages_id_conversation_id_key unique (id, conversation_id);
  end if;
end;
$$;

create table if not exists public.pinned_messages (
  message_id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default pg_catalog.now(),
  constraint pinned_messages_message_conversation_fkey
    foreign key (message_id, conversation_id)
    references public.messages(id, conversation_id)
    on delete cascade
);

create index if not exists pinned_messages_conversation_pinned_at_idx
  on public.pinned_messages(conversation_id, pinned_at desc, message_id desc);

alter table public.pinned_messages enable row level security;
alter table public.pinned_messages replica identity full;

revoke all on table public.pinned_messages from public, anon, authenticated;
grant select on table public.pinned_messages to authenticated;

drop policy if exists pinned_messages_participants_select on public.pinned_messages;
create policy pinned_messages_participants_select
on public.pinned_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = pinned_messages.message_id
      and message.conversation_id = pinned_messages.conversation_id
      and message.is_deleted = false
      and message.source_request_id is null
      and private.can_read_conversation_message(message.conversation_id, message.created_at)
  )
);

create or replace function public.set_message_pinned(
  target_message_id uuid,
  pinned boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messages%rowtype;
  v_pin_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_message_id is null or pinned is null then
    raise exception using errcode = '22023', message = 'A message ID and pin state are required.';
  end if;

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id
  for update;

  if v_message.id is null
    or v_message.is_deleted
    or v_message.source_request_id is not null
    or v_message.message_type not in ('text'::text, 'image'::text, 'voice'::text)
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for pinning.';
  end if;

  if not exists (
    select 1
    from public.conversation_participants as participant
    join public.conversations as conversation
      on conversation.id = participant.conversation_id
    where participant.conversation_id = v_message.conversation_id
      and participant.user_id = v_user_id
      and conversation.conversation_type = 'direct'::text
  ) then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  -- Serializing mutations on the conversation row makes the shared 50-pin
  -- limit deterministic under concurrent participant requests.
  perform 1
  from public.conversations as conversation
  where conversation.id = v_message.conversation_id
  for update;

  if not pinned then
    delete from public.pinned_messages as pin
    where pin.message_id = v_message.id
      and pin.conversation_id = v_message.conversation_id;
    return false;
  end if;

  if exists (
    select 1
    from public.pinned_messages as pin
    where pin.message_id = v_message.id
      and pin.conversation_id = v_message.conversation_id
  ) then
    return true;
  end if;

  select pg_catalog.count(*)::integer
  into v_pin_count
  from public.pinned_messages as pin
  where pin.conversation_id = v_message.conversation_id;

  if v_pin_count >= 50 then
    raise exception using errcode = '54000', message = 'This conversation already has 50 pinned messages.';
  end if;

  insert into public.pinned_messages (message_id, conversation_id, pinned_by)
  values (v_message.id, v_message.conversation_id, v_user_id)
  on conflict (message_id) do nothing;

  return true;
end;
$$;

create or replace function public.list_pinned_messages(
  target_conversation_id uuid,
  page_size integer default 50
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  message_type text,
  pinned_by uuid,
  pinned_at timestamptz,
  attachment_count integer,
  voice_duration_ms integer
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
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;

  if not exists (
    select 1
    from public.conversation_participants as participant
    join public.conversations as conversation
      on conversation.id = participant.conversation_id
    where participant.conversation_id = target_conversation_id
      and participant.user_id = v_user_id
      and conversation.conversation_type = 'direct'::text
  ) then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  return query
  select
    pin.message_id,
    pin.conversation_id,
    message.sender_id,
    message.body,
    message.created_at,
    message.message_type,
    pin.pinned_by,
    pin.pinned_at,
    attachment_totals.attachment_count,
    attachment_totals.voice_duration_ms
  from public.pinned_messages as pin
  join public.messages as message
    on message.id = pin.message_id
   and message.conversation_id = pin.conversation_id
  cross join lateral (
    select
      pg_catalog.count(*)::integer as attachment_count,
      pg_catalog.max(attachment.duration_ms) filter (where attachment.attachment_kind = 'voice'::text) as voice_duration_ms
    from public.message_attachments as attachment
    where attachment.message_id = message.id
  ) as attachment_totals
  where pin.conversation_id = target_conversation_id
    and message.is_deleted = false
    and message.source_request_id is null
    and message.message_type in ('text'::text, 'image'::text, 'voice'::text)
    and private.can_read_conversation_message(message.conversation_id, message.created_at)
  order by pin.pinned_at desc, pin.message_id desc
  limit v_page_size;
end;
$$;

create or replace function private.remove_soft_deleted_message_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_deleted and not old.is_deleted then
    delete from public.pinned_messages as pin
    where pin.message_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_remove_pin_after_soft_delete on public.messages;
create trigger messages_remove_pin_after_soft_delete
after update of is_deleted on public.messages
for each row
execute function private.remove_soft_deleted_message_pin();

revoke all on function public.set_message_pinned(uuid, boolean) from public;
revoke all on function public.set_message_pinned(uuid, boolean) from anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

revoke all on function public.list_pinned_messages(uuid, integer) from public;
revoke all on function public.list_pinned_messages(uuid, integer) from anon;
grant execute on function public.list_pinned_messages(uuid, integer) to authenticated;

revoke all on function private.remove_soft_deleted_message_pin() from public;
revoke all on function private.remove_soft_deleted_message_pin() from anon;
revoke all on function private.remove_soft_deleted_message_pin() from authenticated;

comment on table public.pinned_messages is 'Shared accepted-conversation pins containing metadata only; message content remains authoritative in public.messages.';
comment on function public.set_message_pinned(uuid, boolean) is 'Idempotently pins or unpins one accessible confirmed message for all participants, with a transactionally serialized 50-pin conversation limit.';
comment on function public.list_pinned_messages(uuid, integer) is 'Returns at most 50 safe pinned-message previews visible after auth.uid() participant history cutoff.';
comment on function private.remove_soft_deleted_message_pin() is 'Removes shared pin metadata whenever a message transitions into soft-deleted state.';

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
      and tablename = 'pinned_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.pinned_messages';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'pinned_messages'
-- order by ordinal_position;
--
-- select pg_catalog.to_regprocedure('public.set_message_pinned(uuid,boolean)') as mutation_rpc,
--        pg_catalog.to_regprocedure('public.list_pinned_messages(uuid,integer)') as list_rpc,
--        pg_catalog.to_regprocedure('private.remove_soft_deleted_message_pin()') as cleanup_trigger_function;
--
-- select has_function_privilege('anon', 'public.set_message_pinned(uuid,boolean)', 'execute') as anon_can_mutate,
--        has_function_privilege('authenticated', 'public.set_message_pinned(uuid,boolean)', 'execute') as authenticated_can_mutate,
--        has_table_privilege('authenticated', 'public.pinned_messages', 'insert,delete,update') as authenticated_has_broad_pin_writes;
--
-- select policyname, cmd, roles, qual
-- from pg_catalog.pg_policies
-- where schemaname = 'public' and tablename = 'pinned_messages';
--
-- select trigger_name, action_timing, event_manipulation, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table = 'messages'
--   and trigger_name = 'messages_remove_pin_after_soft_delete';
--
-- select schemaname, tablename
-- from pg_catalog.pg_publication_tables
-- where pubname = 'supabase_realtime'
--   and schemaname = 'public'
--   and tablename = 'pinned_messages';
