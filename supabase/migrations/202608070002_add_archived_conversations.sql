begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.messages') is null then
    raise exception 'Archived conversations require the conversation and message schema migrations first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_participants'
      and column_name = 'is_pinned'
  ) then
    raise exception 'Archived conversations require 202608070001_add_pinned_conversations.sql first.';
  end if;
end;
$$;

alter table public.conversation_participants
  add column if not exists archived_at timestamptz null;

comment on column public.conversation_participants.archived_at is 'When this participant archived the conversation; null keeps it in their normal inbox.';

create or replace function public.set_conversation_pinned(
  target_conversation_id uuid,
  pinned boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_pinned boolean;
  v_archived_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null then
    raise exception using errcode = '22004', message = 'A conversation is required.';
  end if;

  if pinned is null then
    raise exception using errcode = '22004', message = 'A pinned state is required.';
  end if;

  select participant.archived_at
  into v_archived_at
  from public.conversation_participants as participant
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if pinned and v_archived_at is not null then
    raise exception using errcode = '22023', message = 'Archived conversations cannot be pinned.';
  end if;

  update public.conversation_participants as participant
  set is_pinned = pinned
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
  returning participant.is_pinned into v_saved_pinned;

  return v_saved_pinned;
end;
$$;

create or replace function public.set_conversation_archived(
  target_conversation_id uuid,
  archived boolean
)
returns table (
  archived_at timestamptz,
  is_pinned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null then
    raise exception using errcode = '22004', message = 'A conversation is required.';
  end if;

  if archived is null then
    raise exception using errcode = '22004', message = 'An archived state is required.';
  end if;

  return query
  update public.conversation_participants as participant
  set archived_at = case when archived then coalesce(participant.archived_at, pg_catalog.now()) else null::timestamptz end,
      is_pinned = case when archived then false else participant.is_pinned end
  from public.conversations as conversation
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
    and conversation.id = participant.conversation_id
    and conversation.conversation_type = 'direct'
  returning participant.archived_at, participant.is_pinned;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;
end;
$$;

create or replace function private.unarchive_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants as participant
  set archived_at = null
  from public.conversations as conversation
  where participant.conversation_id = new.conversation_id
    and participant.user_id <> new.sender_id
    and participant.archived_at is not null
    and conversation.id = participant.conversation_id
    and conversation.conversation_type = 'direct'
    and exists (
      select 1
      from public.conversation_participants as sender_participant
      where sender_participant.conversation_id = new.conversation_id
        and sender_participant.user_id = new.sender_id
    );

  return new;
end;
$$;

drop trigger if exists messages_unarchive_recipients on public.messages;
create trigger messages_unarchive_recipients
after insert on public.messages
for each row
execute function private.unarchive_message_recipients();

revoke all on function public.set_conversation_archived(uuid, boolean) from public;
revoke all on function public.set_conversation_archived(uuid, boolean) from anon;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;

revoke all on function public.set_conversation_pinned(uuid, boolean) from public;
revoke all on function public.set_conversation_pinned(uuid, boolean) from anon;
grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;

revoke all on function private.unarchive_message_recipients() from public;
revoke all on function private.unarchive_message_recipients() from anon;
revoke all on function private.unarchive_message_recipients() from authenticated;

comment on function public.set_conversation_archived(uuid, boolean) is 'Updates only auth.uid() archive state and clears that participant pin when archiving.';
comment on function public.set_conversation_pinned(uuid, boolean) is 'Updates only auth.uid() pin state and prevents archived conversations from being pinned.';
comment on function private.unarchive_message_recipients() is 'After an authoritative message insert, restores every other archived participant to their normal inbox.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in the Supabase SQL Editor):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'conversation_participants'
--   and column_name in ('is_pinned', 'archived_at')
-- order by column_name;
--
-- select pg_catalog.to_regprocedure('public.set_conversation_archived(uuid,boolean)') as archive_rpc,
--        pg_catalog.to_regprocedure('public.set_conversation_pinned(uuid,boolean)') as pin_rpc,
--        has_function_privilege('anon', 'public.set_conversation_archived(uuid,boolean)', 'execute') as anon_can_execute,
--        has_function_privilege('authenticated', 'public.set_conversation_archived(uuid,boolean)', 'execute') as authenticated_can_execute;
--
-- select trigger_name, event_manipulation, action_timing, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table = 'messages'
--   and trigger_name = 'messages_unarchive_recipients';
