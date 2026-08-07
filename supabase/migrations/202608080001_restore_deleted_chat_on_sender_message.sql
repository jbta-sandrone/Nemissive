begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.messages') is null then
    raise exception 'Sender-side chat restoration requires the current direct-conversation messaging schema.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_participants'
      and column_name in ('history_cleared_at', 'deleted_at', 'archived_at', 'is_pinned', 'muted_until', 'last_read_at', 'last_delivered_at')
    group by table_schema, table_name
    having pg_catalog.count(*) = 7
  ) then
    raise exception 'Sender-side chat restoration requires the participant deletion, archive, pin, mute, and receipt fields.';
  end if;

  if pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
    or pg_catalog.to_regprocedure('private.unarchive_message_recipients()') is null then
    raise exception 'Apply 202608070003_add_participant_chat_deletion.sql before this corrective migration.';
  end if;
end;
$$;

-- Accepted participation authorizes a new send even while the caller's inbox copy
-- is hidden. The authoritative message INSERT restores visibility afterward.
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
      and conversation.conversation_type = 'direct'::text
  );
$$;

revoke all on function private.can_send_conversation_message(uuid) from public;
revoke all on function private.can_send_conversation_message(uuid) from anon;
grant execute on function private.can_send_conversation_message(uuid) to authenticated;

-- The stale-sender guard conflicts with accepted-relationship semantics. Sending
-- remains protected by RLS/RPC membership checks and restores only after INSERT.
drop trigger if exists messages_prevent_deleted_participant_insert on public.messages;
drop function if exists private.prevent_deleted_participant_message_insert();

-- One authoritative AFTER INSERT path covers text, image, and voice messages.
-- Sender: clear only deleted_at. Recipients: retain the existing archive/delete
-- restoration behavior. No participant's history cutoff, mute, pin, or receipts
-- are changed here.
create or replace function private.unarchive_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants as participant
  set archived_at = case
        when participant.user_id <> new.sender_id then null
        else participant.archived_at
      end,
      deleted_at = null
  from public.conversations as conversation
  where participant.conversation_id = new.conversation_id
    and conversation.id = participant.conversation_id
    and conversation.conversation_type = 'direct'::text
    and exists (
      select 1
      from public.conversation_participants as sender_participant
      where sender_participant.conversation_id = new.conversation_id
        and sender_participant.user_id = new.sender_id
    )
    and (
      (participant.user_id = new.sender_id and participant.deleted_at is not null)
      or (
        participant.user_id <> new.sender_id
        and (participant.archived_at is not null or participant.deleted_at is not null)
      )
    );

  return new;
end;
$$;

drop trigger if exists messages_unarchive_recipients on public.messages;
create trigger messages_unarchive_recipients
after insert on public.messages
for each row
execute function private.unarchive_message_recipients();

revoke all on function private.unarchive_message_recipients() from public;
revoke all on function private.unarchive_message_recipients() from anon;
revoke all on function private.unarchive_message_recipients() from authenticated;

comment on function private.can_send_conversation_message(uuid) is 'Authorizes auth.uid() to send through an existing accepted direct-conversation participant row; visibility restoration occurs only after authoritative message insertion.';
comment on function private.unarchive_message_recipients() is 'Restores a deleted sender after an authoritative send and restores recipient inbox/archive visibility without changing history cutoffs, mute, pin, or receipts.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') as send_helper,
--        pg_catalog.to_regprocedure('private.unarchive_message_recipients()') as restoration_helper,
--        pg_catalog.to_regprocedure('private.prevent_deleted_participant_message_insert()') as removed_sender_guard;
--
-- select trigger_name, event_manipulation, action_timing, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table = 'messages'
--   and trigger_name in ('messages_unarchive_recipients', 'messages_prevent_deleted_participant_insert')
-- order by trigger_name;
--
-- select has_function_privilege('anon', 'private.can_send_conversation_message(uuid)', 'execute') as anon_can_execute_send_helper,
--        has_function_privilege('authenticated', 'private.can_send_conversation_message(uuid)', 'execute') as authenticated_can_execute_send_helper,
--        has_table_privilege('authenticated', 'public.conversation_participants', 'update') as authenticated_has_direct_participant_update;
