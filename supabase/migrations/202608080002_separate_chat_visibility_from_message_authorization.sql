begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.messages') is null then
    raise exception 'Sender restoration requires the current direct-conversation messaging schema.';
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
    raise exception 'Apply the participant chat-deletion and sender-restoration migrations before this corrective migration.';
  end if;

  if pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
    or pg_catalog.to_regprocedure('private.unarchive_message_recipients()') is null then
    raise exception 'Apply 202608080001_restore_deleted_chat_on_sender_message.sql before this corrective migration.';
  end if;
end;
$$;

-- deleted_at is an inbox-visibility preference. Message authorization is based
-- on accepted participation plus the permanent participant-specific cutoff.
-- Keeping deleted_at out of this helper also permits INSERT ... RETURNING to
-- return the newly-created post-cutoff row before the AFTER INSERT restoration
-- trigger has finished updating the sender participant row.
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
    join public.conversations as conversation
      on conversation.id = participant.conversation_id
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
      and conversation.conversation_type = 'direct'::text
      and (
        participant.history_cleared_at is null
        or target_created_at > participant.history_cleared_at
      )
  );
$$;

revoke all on function private.can_read_conversation_message(uuid, timestamptz) from public;
revoke all on function private.can_read_conversation_message(uuid, timestamptz) from anon;
grant execute on function private.can_read_conversation_message(uuid, timestamptz) to authenticated;

-- Reassert the accepted-participation send predicate from 202608080001. It
-- intentionally does not use deleted_at or history_cleared_at as send gates.
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
    join public.conversations as conversation
      on conversation.id = participant.conversation_id
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
      and conversation.conversation_type = 'direct'::text
  );
$$;

revoke all on function private.can_send_conversation_message(uuid) from public;
revoke all on function private.can_send_conversation_message(uuid) from anon;
grant execute on function private.can_send_conversation_message(uuid) to authenticated;

-- Remove the obsolete pre-insert rejection again so this migration is safe on
-- databases where the prior corrective migration was only partially inspected.
drop trigger if exists messages_prevent_deleted_participant_insert on public.messages;
drop function if exists private.prevent_deleted_participant_message_insert();

-- Preserve the authoritative post-insert restoration for every message path.
-- The sender regains inbox visibility only if the message INSERT commits. Other
-- participants retain the existing incoming unarchive/restore behavior.
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

-- Reassert the direct text INSERT contract. The returned row is authorized by
-- messages_participants_select through the cutoff-aware read helper above.
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

comment on function private.can_read_conversation_message(uuid, timestamptz) is 'Authorizes message access through accepted participation and auth.uid() history cutoff; deleted_at controls inbox visibility only.';
comment on function private.can_send_conversation_message(uuid) is 'Authorizes auth.uid() to send through an existing accepted direct-conversation participant row, independent of participant inbox visibility.';
comment on function private.unarchive_message_recipients() is 'After a confirmed message insert, restores the sender deleted inbox state and recipient archive/delete state without changing history cutoffs, mute, pin, or receipts.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select pg_catalog.pg_get_functiondef(
--   pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)')
-- );
--
-- select pg_catalog.pg_get_functiondef(
--   pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)')
-- );
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_catalog.pg_policies
-- where schemaname = 'public'
--   and tablename = 'messages'
--   and policyname in ('messages_participants_select', 'messages_participants_insert')
-- order by policyname;
--
-- select trigger_name, action_timing, event_manipulation, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table = 'messages'
--   and trigger_name in ('messages_unarchive_recipients', 'messages_prevent_deleted_participant_insert')
-- order by trigger_name;
--
-- select has_function_privilege('anon', 'private.can_send_conversation_message(uuid)', 'execute') as anon_can_send_helper,
--        has_function_privilege('authenticated', 'private.can_send_conversation_message(uuid)', 'execute') as authenticated_can_send_helper,
--        has_table_privilege('authenticated', 'public.conversation_participants', 'update') as authenticated_has_direct_participant_update;
