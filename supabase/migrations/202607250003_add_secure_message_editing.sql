begin;

alter table public.messages
add column edited_at timestamptz;

comment on column public.messages.edited_at is 'Database timestamp of the most recent user-authored body edit; null means never edited.';

revoke update on table public.messages from public, anon, authenticated;
revoke update (id, conversation_id, sender_id, body, source_request_id, created_at, updated_at, reply_to_message_id, edited_at)
on public.messages
from public, anon, authenticated;

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
  returning message.* into v_message;

  return v_message;
end;
$$;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

comment on function public.edit_message(uuid, text) is 'Edits only auth.uid() owned, non-introduction messages in accepted conversations.';

commit;
