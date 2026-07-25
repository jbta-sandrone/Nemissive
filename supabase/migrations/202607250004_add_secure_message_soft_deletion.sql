begin;

alter table public.messages
add column is_deleted boolean not null default false,
add column deleted_at timestamptz;

alter table public.messages
drop constraint if exists messages_body_check;

alter table public.messages
add constraint messages_body_check check (
  (
    is_deleted = false
    and deleted_at is null
    and body = pg_catalog.btrim(body)
    and pg_catalog.char_length(body) between 1 and 4000
  )
  or
  (
    is_deleted = true
    and deleted_at is not null
    and body = ''
  )
);

comment on column public.messages.is_deleted is 'Terminal soft-deletion marker. Deleted rows retain identity, ordering, replies, and receipt semantics.';
comment on column public.messages.deleted_at is 'Database timestamp when the sender soft-deleted this message.';

revoke update on table public.messages from public, anon, authenticated;
revoke update (id, conversation_id, sender_id, body, source_request_id, created_at, updated_at, reply_to_message_id, edited_at, is_deleted, deleted_at)
on public.messages
from public, anon, authenticated;

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
  ) then
    raise exception using
      errcode = '23514',
      message = 'The reply target is unavailable in this conversation.';
  end if;

  return new;
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
  v_body text;
  v_message public.messages%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null then
    raise exception using errcode = '22023', message = 'A message ID is required.';
  end if;

  v_body := pg_catalog.btrim(new_body);

  if v_body is null or pg_catalog.char_length(v_body) = 0 then
    raise exception using errcode = '22023', message = 'A message cannot be empty.';
  end if;

  if pg_catalog.char_length(v_body) > 2000 then
    raise exception using errcode = '22023', message = 'A message must be 2,000 characters or fewer.';
  end if;

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id
    and message.sender_id = v_user_id
  for update;

  if v_message.id is null then
    raise exception using errcode = '42501', message = 'The message is unavailable for editing.';
  end if;

  if v_message.is_deleted then
    raise exception using errcode = '42501', message = 'Deleted messages cannot be edited.';
  end if;

  if v_message.source_request_id is not null then
    raise exception using errcode = '42501', message = 'Conversation introductions cannot be edited.';
  end if;

  if not exists (
    select 1
    from public.conversation_participants as participant
    where participant.conversation_id = v_message.conversation_id
      and participant.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if v_body = v_message.body then
    return v_message;
  end if;

  update public.messages as message
  set body = v_body,
      edited_at = pg_catalog.now()
  where message.id = v_message.id
    and message.is_deleted = false
  returning message.* into v_message;

  if v_message.id is null then
    raise exception using errcode = '55000', message = 'Deleted messages cannot be edited.';
  end if;

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
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null then
    raise exception using errcode = '22023', message = 'A message ID is required.';
  end if;

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id
    and message.sender_id = v_user_id
  for update;

  if v_message.id is null then
    raise exception using errcode = '42501', message = 'The message is unavailable for deletion.';
  end if;

  if v_message.source_request_id is not null then
    raise exception using errcode = '42501', message = 'Conversation introductions cannot be deleted.';
  end if;

  if not exists (
    select 1
    from public.conversation_participants as participant
    where participant.conversation_id = v_message.conversation_id
      and participant.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if v_message.is_deleted then
    return v_message;
  end if;

  update public.messages as message
  set body = '',
      is_deleted = true,
      deleted_at = pg_catalog.now()
  where message.id = v_message.id
    and message.is_deleted = false
  returning message.* into v_message;

  return v_message;
end;
$$;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

revoke all on function public.delete_message(uuid) from public;
revoke all on function public.delete_message(uuid) from anon;
grant execute on function public.delete_message(uuid) to authenticated;

comment on function public.delete_message(uuid) is 'Idempotently soft-deletes only an auth.uid()-owned, non-introduction message and redacts its stored body.';

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
      and private.is_conversation_participant(message.conversation_id)
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
      and private.is_conversation_participant(message.conversation_id)
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
      and private.is_conversation_participant(message.conversation_id)
  )
);

commit;
