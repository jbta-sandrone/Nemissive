begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null then
    raise exception 'Pinned conversations require public.conversation_participants. Apply the conversation migrations first.';
  end if;
end;
$$;

alter table public.conversation_participants
  add column if not exists is_pinned boolean not null default false;

comment on column public.conversation_participants.is_pinned is 'Whether this participant pins the conversation at the top of their own message list.';

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

  update public.conversation_participants as participant
  set is_pinned = pinned
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
  returning participant.is_pinned into v_saved_pinned;

  if not found then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  return v_saved_pinned;
end;
$$;

revoke all on function public.set_conversation_pinned(uuid, boolean) from public;
revoke all on function public.set_conversation_pinned(uuid, boolean) from anon;
grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;

comment on function public.set_conversation_pinned(uuid, boolean) is 'Updates only auth.uid() pin state for an existing conversation membership.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in the Supabase SQL Editor):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'conversation_participants'
--   and column_name = 'is_pinned';
--
-- select pg_catalog.to_regprocedure('public.set_conversation_pinned(uuid,boolean)') as pin_rpc,
--        has_function_privilege('anon', 'public.set_conversation_pinned(uuid,boolean)', 'execute') as anon_can_execute,
--        has_function_privilege('authenticated', 'public.set_conversation_pinned(uuid,boolean)', 'execute') as authenticated_can_execute;
