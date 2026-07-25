begin;

alter table public.messages
add column reply_to_message_id uuid references public.messages(id) on delete set null;

comment on column public.messages.reply_to_message_id is 'Optional confirmed message in the same conversation that this message replies to.';

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
  ) then
    raise exception using
      errcode = '23514',
      message = 'The reply target is unavailable in this conversation.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_message_reply_target() from public;
revoke all on function private.validate_message_reply_target() from anon;
revoke all on function private.validate_message_reply_target() from authenticated;

create trigger messages_validate_reply_target
before insert or update of conversation_id, reply_to_message_id on public.messages
for each row execute function private.validate_message_reply_target();

grant insert (reply_to_message_id)
on public.messages
to authenticated;

commit;
