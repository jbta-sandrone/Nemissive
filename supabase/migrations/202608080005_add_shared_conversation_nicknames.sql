begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversation_events') is null then
    raise exception 'Shared nicknames require the accepted-conversation and conversation-events schema.';
  end if;

  if pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') is null
    or pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null then
    raise exception 'Apply 202608080004_add_pinned_message_activity_events.sql before this migration.';
  end if;
end;
$$;

create table if not exists public.conversation_nicknames (
  conversation_id uuid not null,
  user_id uuid not null,
  nickname text not null,
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (conversation_id, user_id),
  constraint conversation_nicknames_participant_fkey
    foreign key (conversation_id, user_id)
    references public.conversation_participants(conversation_id, user_id)
    on delete cascade,
  constraint conversation_nicknames_updated_by_participant_fkey
    foreign key (conversation_id, updated_by)
    references public.conversation_participants(conversation_id, user_id)
    on delete cascade,
  constraint conversation_nicknames_value_check
    check (
      nickname = btrim(nickname)
      and char_length(nickname) between 1 and 40
      and nickname !~ '[[:cntrl:]]'
    )
);

alter table public.conversation_nicknames enable row level security;
alter table public.conversation_nicknames replica identity full;

revoke all on table public.conversation_nicknames from public, anon, authenticated;
grant select on table public.conversation_nicknames to authenticated;

drop policy if exists conversation_nicknames_participants_select on public.conversation_nicknames;
create policy conversation_nicknames_participants_select
on public.conversation_nicknames
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_participants as viewer
    join public.conversations as conversation
      on conversation.id = viewer.conversation_id
    where viewer.conversation_id = conversation_nicknames.conversation_id
      and viewer.user_id = auth.uid()
      and conversation.conversation_type = 'direct'::text
  )
);

alter table public.conversation_events
  add column if not exists target_user_id uuid,
  add column if not exists nickname_value text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.conversation_events'::regclass
      and conname = 'conversation_events_actor_participant_fkey'
  ) then
    alter table public.conversation_events
      add constraint conversation_events_actor_participant_fkey
      foreign key (conversation_id, actor_id)
      references public.conversation_participants(conversation_id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.conversation_events'::regclass
      and conname = 'conversation_events_target_user_participant_fkey'
  ) then
    alter table public.conversation_events
      add constraint conversation_events_target_user_participant_fkey
      foreign key (conversation_id, target_user_id)
      references public.conversation_participants(conversation_id, user_id)
      on delete cascade;
  end if;
end;
$$;

alter table public.conversation_events
  drop constraint if exists conversation_events_type_check,
  drop constraint if exists conversation_events_message_pinned_target_check,
  drop constraint if exists conversation_events_payload_check;

alter table public.conversation_events
  add constraint conversation_events_type_check
    check (event_type in ('message_pinned'::text, 'nickname_changed'::text, 'nickname_removed'::text)),
  add constraint conversation_events_payload_check
    check (
      (
        event_type = 'message_pinned'::text
        and target_message_id is not null
        and target_user_id is null
        and nickname_value is null
      )
      or
      (
        event_type = 'nickname_changed'::text
        and target_message_id is null
        and target_user_id is not null
        and nickname_value is not null
        and nickname_value = btrim(nickname_value)
        and char_length(nickname_value) between 1 and 40
        and nickname_value !~ '[[:cntrl:]]'
      )
      or
      (
        event_type = 'nickname_removed'::text
        and target_message_id is null
        and target_user_id is not null
        and nickname_value is null
      )
    );

drop policy if exists conversation_events_participants_select on public.conversation_events;
create policy conversation_events_participants_select
on public.conversation_events
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_participants as viewer
    join public.conversations as conversation
      on conversation.id = viewer.conversation_id
    where viewer.conversation_id = conversation_events.conversation_id
      and viewer.user_id = auth.uid()
      and conversation.conversation_type = 'direct'::text
      and (
        (
          conversation_events.event_type = 'message_pinned'::text
          and exists (
            select 1
            from public.messages as target
            where target.id = conversation_events.target_message_id
              and target.conversation_id = conversation_events.conversation_id
              and target.is_deleted = false
              and target.source_request_id is null
              and private.can_read_conversation_message(target.conversation_id, target.created_at)
          )
        )
        or
        (
          conversation_events.event_type in ('nickname_changed'::text, 'nickname_removed'::text)
          and conversation_events.created_at > coalesce(viewer.history_cleared_at, '-infinity'::timestamptz)
        )
      )
  )
);

create or replace function public.set_conversation_nickname(
  target_conversation_id uuid,
  target_user_id uuid,
  nickname_text text
)
returns table (
  conversation_id uuid,
  user_id uuid,
  nickname text,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_normalized_nickname text;
  v_existing_nickname text;
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null or target_user_id is null then
    raise exception using errcode = '22023', message = 'A conversation and participant are required.';
  end if;

  if nickname_text is not null then
    v_normalized_nickname := btrim(nickname_text);
    if v_normalized_nickname = ''::text then
      raise exception using errcode = '22023', message = 'A nickname cannot be empty.';
    end if;
    if char_length(v_normalized_nickname) > 40 then
      raise exception using errcode = '22023', message = 'A nickname must be 40 characters or fewer.';
    end if;
    if v_normalized_nickname ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'A nickname contains unsupported control characters.';
    end if;
  end if;

  perform 1
  from public.conversation_participants as target_participant
  join public.conversations as conversation
    on conversation.id = target_participant.conversation_id
  where target_participant.conversation_id = target_conversation_id
    and target_participant.user_id = target_user_id
    and conversation.conversation_type = 'direct'::text
    and exists (
      select 1
      from public.conversation_participants as actor_participant
      where actor_participant.conversation_id = target_conversation_id
        and actor_participant.user_id = v_actor_id
    )
  for update of target_participant;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation participant is unavailable.';
  end if;

  select saved.nickname
  into v_existing_nickname
  from public.conversation_nicknames as saved
  where saved.conversation_id = target_conversation_id
    and saved.user_id = target_user_id;

  if v_normalized_nickname is not distinct from v_existing_nickname then
    return query
    select target_conversation_id, target_user_id, v_existing_nickname, v_actor_id, v_changed_at;
    return;
  end if;

  if v_normalized_nickname is null then
    delete from public.conversation_nicknames as saved
    where saved.conversation_id = target_conversation_id
      and saved.user_id = target_user_id;

    if found then
      insert into public.conversation_events (
        conversation_id,
        actor_id,
        event_type,
        target_user_id,
        nickname_value
      ) values (
        target_conversation_id,
        v_actor_id,
        'nickname_removed'::text,
        target_user_id,
        null::text
      );
    end if;
  else
    insert into public.conversation_nicknames (
      conversation_id,
      user_id,
      nickname,
      updated_by,
      updated_at
    ) values (
      target_conversation_id,
      target_user_id,
      v_normalized_nickname,
      v_actor_id,
      v_changed_at
    )
    on conflict (conversation_id, user_id) do update
      set nickname = excluded.nickname,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;

    insert into public.conversation_events (
      conversation_id,
      actor_id,
      event_type,
      target_user_id,
      nickname_value
    ) values (
      target_conversation_id,
      v_actor_id,
      'nickname_changed'::text,
      target_user_id,
      v_normalized_nickname
    );
  end if;

  return query
  select target_conversation_id, target_user_id, v_normalized_nickname, v_actor_id, v_changed_at;
end;
$$;

drop function public.list_conversation_events(uuid, integer);

create function public.list_conversation_events(
  target_conversation_id uuid,
  page_size integer default 50
)
returns table (
  event_id uuid,
  conversation_id uuid,
  actor_id uuid,
  event_type text,
  target_message_id uuid,
  target_user_id uuid,
  nickname_value text,
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
  v_history_cleared_at timestamptz;
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

  select participant.history_cleared_at
  into v_history_cleared_at
  from public.conversation_participants as participant
  join public.conversations as conversation
    on conversation.id = participant.conversation_id
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
    and conversation.conversation_type = 'direct'::text;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  return query
  select
    event.id,
    event.conversation_id,
    event.actor_id,
    event.event_type,
    event.target_message_id,
    event.target_user_id,
    event.nickname_value,
    event.created_at
  from public.conversation_events as event
  where event.conversation_id = target_conversation_id
    and (
      (
        event.event_type = 'message_pinned'::text
        and exists (
          select 1
          from public.messages as target
          where target.id = event.target_message_id
            and target.conversation_id = event.conversation_id
            and target.is_deleted = false
            and target.source_request_id is null
            and private.can_read_conversation_message(target.conversation_id, target.created_at)
        )
      )
      or
      (
        event.event_type in ('nickname_changed'::text, 'nickname_removed'::text)
        and event.created_at > coalesce(v_history_cleared_at, '-infinity'::timestamptz)
      )
    )
  order by event.created_at desc, event.id desc
  limit v_page_size;
end;
$$;

revoke all on function public.set_conversation_nickname(uuid, uuid, text) from public;
revoke all on function public.set_conversation_nickname(uuid, uuid, text) from anon;
grant execute on function public.set_conversation_nickname(uuid, uuid, text) to authenticated;

revoke all on function public.list_conversation_events(uuid, integer) from public;
revoke all on function public.list_conversation_events(uuid, integer) from anon;
grant execute on function public.list_conversation_events(uuid, integer) to authenticated;

comment on table public.conversation_nicknames is 'Shared, conversation-scoped participant nicknames that do not replace global profile identity.';
comment on function public.set_conversation_nickname(uuid, uuid, text) is 'Atomically sets or removes one shared participant nickname and records a strictly shaped conversation activity event.';
comment on function public.list_conversation_events(uuid, integer) is 'Returns at most 50 cutoff-safe pin and nickname activity rows without message bodies or media metadata.';

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
      and tablename = 'conversation_nicknames'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_nicknames';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in Supabase SQL Editor):
-- select pg_catalog.to_regclass('public.conversation_nicknames') as nickname_table,
--        pg_catalog.to_regprocedure('public.set_conversation_nickname(uuid,uuid,text)') as nickname_rpc,
--        pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') as event_list_rpc;
--
-- select has_function_privilege('anon', 'public.set_conversation_nickname(uuid,uuid,text)', 'execute') as anon_can_set,
--        has_function_privilege('authenticated', 'public.set_conversation_nickname(uuid,uuid,text)', 'execute') as authenticated_can_set,
--        has_table_privilege('authenticated', 'public.conversation_nicknames', 'insert') as authenticated_can_insert_directly,
--        has_table_privilege('authenticated', 'public.conversation_nicknames', 'select') as authenticated_can_select;
--
-- select conname, pg_catalog.pg_get_constraintdef(oid)
-- from pg_catalog.pg_constraint
-- where conrelid in ('public.conversation_nicknames'::regclass, 'public.conversation_events'::regclass)
-- order by conrelid::regclass::text, conname;
--
-- select policyname, tablename, cmd, roles, qual
-- from pg_catalog.pg_policies
-- where schemaname = 'public'
--   and tablename in ('conversation_nicknames', 'conversation_events')
-- order by tablename, policyname;
--
-- select schemaname, tablename
-- from pg_catalog.pg_publication_tables
-- where pubname = 'supabase_realtime'
--   and schemaname = 'public'
--   and tablename in ('conversation_events', 'conversation_nicknames')
-- order by tablename;
