begin;

do $$
begin
  if pg_catalog.to_regclass('public.pinned_messages') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null then
    raise exception 'Pinned-message activity requires the shared pinned-messages schema.';
  end if;

  if pg_catalog.to_regprocedure('public.set_message_pinned(uuid,boolean)') is null
    or pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.remove_soft_deleted_message_pin()') is null then
    raise exception 'Apply 202608080003_add_shared_pinned_messages.sql before this migration.';
  end if;
end;
$$;

create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  target_message_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  constraint conversation_events_type_check
    check (event_type in ('message_pinned'::text)),
  constraint conversation_events_message_pinned_target_check
    check (event_type <> 'message_pinned'::text or target_message_id is not null),
  constraint conversation_events_target_conversation_fkey
    foreign key (target_message_id, conversation_id)
    references public.messages(id, conversation_id)
    on delete cascade
);

create index if not exists conversation_events_conversation_created_idx
  on public.conversation_events(conversation_id, created_at desc, id desc);

create index if not exists conversation_events_pinned_target_idx
  on public.conversation_events(target_message_id)
  where event_type = 'message_pinned'::text;

alter table public.conversation_events enable row level security;
alter table public.conversation_events replica identity full;

revoke all on table public.conversation_events from public, anon, authenticated;
grant select on table public.conversation_events to authenticated;

drop policy if exists conversation_events_participants_select on public.conversation_events;
create policy conversation_events_participants_select
on public.conversation_events
for select
to authenticated
using (
  event_type = 'message_pinned'::text
  and exists (
    select 1
    from public.messages as target
    where target.id = conversation_events.target_message_id
      and target.conversation_id = conversation_events.conversation_id
      and target.is_deleted = false
      and target.source_request_id is null
      and private.can_read_conversation_message(target.conversation_id, target.created_at)
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
  v_inserted_message_id uuid;
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
  on conflict (message_id) do nothing
  returning message_id into v_inserted_message_id;

  if v_inserted_message_id is not null then
    insert into public.conversation_events (conversation_id, actor_id, event_type, target_message_id)
    values (v_message.conversation_id, v_user_id, 'message_pinned'::text, v_message.id);
  end if;

  return true;
end;
$$;

create or replace function public.list_conversation_events(
  target_conversation_id uuid,
  page_size integer default 50
)
returns table (
  event_id uuid,
  conversation_id uuid,
  actor_id uuid,
  event_type text,
  target_message_id uuid,
  created_at timestamptz
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
    event.id,
    event.conversation_id,
    event.actor_id,
    event.event_type,
    event.target_message_id,
    event.created_at
  from public.conversation_events as event
  join public.messages as target
    on target.id = event.target_message_id
   and target.conversation_id = event.conversation_id
  where event.conversation_id = target_conversation_id
    and event.event_type = 'message_pinned'::text
    and target.is_deleted = false
    and target.source_request_id is null
    and private.can_read_conversation_message(target.conversation_id, target.created_at)
  order by event.created_at desc, event.id desc
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
    delete from public.conversation_events as event
    where event.event_type = 'message_pinned'::text
      and event.target_message_id = new.id;

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

revoke all on function public.list_conversation_events(uuid, integer) from public;
revoke all on function public.list_conversation_events(uuid, integer) from anon;
grant execute on function public.list_conversation_events(uuid, integer) to authenticated;

revoke all on function private.remove_soft_deleted_message_pin() from public;
revoke all on function private.remove_soft_deleted_message_pin() from anon;
revoke all on function private.remove_soft_deleted_message_pin() from authenticated;

comment on table public.conversation_events is 'Bounded, shared conversation activity metadata kept separate from unread- and receipt-bearing messages.';
comment on column public.conversation_events.event_type is 'Constrained activity discriminator; this milestone supports only message_pinned.';
comment on function public.set_message_pinned(uuid, boolean) is 'Atomically creates one shared pin and one message_pinned activity event only when a new pin row is inserted.';
comment on function public.list_conversation_events(uuid, integer) is 'Returns at most 50 cutoff-safe conversation activity rows without message bodies or media metadata.';
comment on function private.remove_soft_deleted_message_pin() is 'Removes shared pin metadata and related message_pinned activity when a target message is soft deleted.';

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
      and tablename = 'conversation_events'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_events';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'conversation_events'
-- order by ordinal_position;
--
-- select pg_catalog.to_regprocedure('public.set_message_pinned(uuid,boolean)') as mutation_rpc,
--        pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') as event_list_rpc,
--        pg_catalog.to_regprocedure('private.remove_soft_deleted_message_pin()') as cleanup_trigger_function;
--
-- select has_function_privilege('anon', 'public.set_message_pinned(uuid,boolean)', 'execute') as anon_can_pin,
--        has_function_privilege('authenticated', 'public.set_message_pinned(uuid,boolean)', 'execute') as authenticated_can_pin,
--        has_table_privilege('authenticated', 'public.conversation_events', 'insert') as authenticated_can_insert_events;
--
-- select policyname, cmd, roles, qual
-- from pg_catalog.pg_policies
-- where schemaname = 'public' and tablename = 'conversation_events';
--
-- select indexname, indexdef
-- from pg_catalog.pg_indexes
-- where schemaname = 'public' and tablename = 'conversation_events'
-- order by indexname;
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
--   and tablename = 'conversation_events';
