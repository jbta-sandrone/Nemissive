begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
  then
    raise exception 'Secure message forwarding requires the existing messages table and conversation authorization helpers.';
  end if;
end;
$$;

alter table public.messages
  add column if not exists is_forwarded boolean not null default false;

comment on column public.messages.is_forwarded is
  'Marks an independent message snapshot created by forwarding. No source-conversation identity or authorization is exposed to the destination.';

create or replace function public.forward_text_message(
  source_message_id uuid,
  target_conversation_id uuid
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_message public.messages%rowtype;
  v_forwarded_message public.messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if source_message_id is null or target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A source message and destination conversation are required.';
  end if;

  select message_row.*
  into v_source_message
  from public.messages as message_row
  where message_row.id = source_message_id
  for share;

  if v_source_message.id is null
    or v_source_message.is_deleted
    or v_source_message.source_request_id is not null
    or v_source_message.message_type <> 'text'::text
    or v_source_message.body is null
    or not private.can_read_conversation_message(
      v_source_message.conversation_id,
      v_source_message.created_at
    )
  then
    raise exception using errcode = '42501', message = 'The source message is unavailable for forwarding.';
  end if;

  if not private.can_send_conversation_message(target_conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for the destination conversation.';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    message_type,
    is_forwarded
  )
  values (
    target_conversation_id,
    v_actor_id,
    v_source_message.body,
    'text'::text,
    true
  )
  returning * into v_forwarded_message;

  return v_forwarded_message;
end;
$$;

revoke all on function public.forward_text_message(uuid, uuid) from public, anon;
grant execute on function public.forward_text_message(uuid, uuid) to authenticated;

comment on function public.forward_text_message(uuid, uuid) is
  'Creates an independent plain-text forwarded-message snapshot after authoritatively checking source history access and destination messaging access for auth.uid().';

notify pgrst, 'reload schema';

commit;

-- Verification (run manually after applying):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'messages'
--   and column_name = 'is_forwarded';
--
-- select pg_catalog.to_regprocedure('public.forward_text_message(uuid,uuid)') as forwarding_rpc;
-- select has_function_privilege('anon', 'public.forward_text_message(uuid,uuid)', 'execute') as anon_can_forward,
--        has_function_privilege('authenticated', 'public.forward_text_message(uuid,uuid)', 'execute') as authenticated_can_forward;
-- select pg_catalog.pg_get_functiondef('public.forward_text_message(uuid,uuid)'::regprocedure);
