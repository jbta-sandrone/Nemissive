begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversation_events') is null
    or pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') is null then
    raise exception 'Shared themes require the accepted-conversation and conversation-events schema through 202608080006.';
  end if;
end;
$$;

alter table public.conversations
  add column if not exists theme_key text not null default 'default'::text;

alter table public.conversations
  drop constraint if exists conversations_theme_key_check,
  add constraint conversations_theme_key_check
    check (theme_key in (
      'default'::text,
      'midnight'::text,
      'ocean'::text,
      'lavender'::text,
      'emerald'::text,
      'rose'::text,
      'sunset'::text
    ));

alter table public.conversation_events
  add column if not exists theme_key text;

alter table public.conversation_events
  drop constraint if exists conversation_events_type_check,
  drop constraint if exists conversation_events_message_pinned_target_check,
  drop constraint if exists conversation_events_payload_check;

alter table public.conversation_events
  add constraint conversation_events_type_check
    check (event_type in (
      'message_pinned'::text,
      'nickname_changed'::text,
      'nickname_removed'::text,
      'theme_changed'::text
    )),
  add constraint conversation_events_payload_check
    check (
      (
        event_type = 'message_pinned'::text
        and target_message_id is not null
        and target_user_id is null
        and nickname_value is null
        and theme_key is null
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
        and theme_key is null
      )
      or
      (
        event_type = 'nickname_removed'::text
        and target_message_id is null
        and target_user_id is not null
        and nickname_value is null
        and theme_key is null
      )
      or
      (
        event_type = 'theme_changed'::text
        and target_message_id is null
        and target_user_id is null
        and nickname_value is null
        and theme_key in (
          'default'::text,
          'midnight'::text,
          'ocean'::text,
          'lavender'::text,
          'emerald'::text,
          'rose'::text,
          'sunset'::text
        )
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
    join public.conversations as selected_conversation
      on selected_conversation.id = viewer.conversation_id
    where viewer.conversation_id = conversation_events.conversation_id
      and viewer.user_id = auth.uid()
      and selected_conversation.conversation_type = 'direct'::text
      and (
        (
          conversation_events.event_type = 'message_pinned'::text
          and exists (
            select 1
            from public.messages as target_message
            where target_message.id = conversation_events.target_message_id
              and target_message.conversation_id = conversation_events.conversation_id
              and target_message.is_deleted = false
              and target_message.source_request_id is null
              and private.can_read_conversation_message(target_message.conversation_id, target_message.created_at)
          )
        )
        or
        (
          conversation_events.event_type in (
            'nickname_changed'::text,
            'nickname_removed'::text,
            'theme_changed'::text
          )
          and conversation_events.created_at > coalesce(viewer.history_cleared_at, '-infinity'::timestamptz)
        )
      )
  )
);

create or replace function public.set_conversation_theme(
  target_conversation_id uuid,
  theme_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_requested_theme_key text := btrim(theme_key);
  v_current_theme_key text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null or theme_key is null then
    raise exception using errcode = '22023', message = 'A conversation and theme are required.';
  end if;
  if v_requested_theme_key not in (
    'default'::text,
    'midnight'::text,
    'ocean'::text,
    'lavender'::text,
    'emerald'::text,
    'rose'::text,
    'sunset'::text
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  select selected_conversation.theme_key
  into v_current_theme_key
  from public.conversations as selected_conversation
  join public.conversation_participants as actor_participant
    on actor_participant.conversation_id = selected_conversation.id
   and actor_participant.user_id = v_actor_id
  where selected_conversation.id = target_conversation_id
    and selected_conversation.conversation_type = 'direct'::text
  for update of selected_conversation;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  if v_current_theme_key = v_requested_theme_key then
    return v_current_theme_key;
  end if;

  update public.conversations as selected_conversation
  set theme_key = v_requested_theme_key
  where selected_conversation.id = target_conversation_id;

  insert into public.conversation_events (
    conversation_id,
    actor_id,
    event_type,
    theme_key
  ) values (
    target_conversation_id,
    v_actor_id,
    'theme_changed'::text,
    v_requested_theme_key
  );

  return v_requested_theme_key;
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
  theme_key text,
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

  select viewer.history_cleared_at
  into v_history_cleared_at
  from public.conversation_participants as viewer
  join public.conversations as selected_conversation
    on selected_conversation.id = viewer.conversation_id
  where viewer.conversation_id = target_conversation_id
    and viewer.user_id = v_user_id
    and selected_conversation.conversation_type = 'direct'::text;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  return query
  select
    conversation_event.id,
    conversation_event.conversation_id,
    conversation_event.actor_id,
    conversation_event.event_type,
    conversation_event.target_message_id,
    conversation_event.target_user_id,
    conversation_event.nickname_value,
    conversation_event.theme_key,
    conversation_event.created_at
  from public.conversation_events as conversation_event
  where conversation_event.conversation_id = target_conversation_id
    and (
      (
        conversation_event.event_type = 'message_pinned'::text
        and exists (
          select 1
          from public.messages as target_message
          where target_message.id = conversation_event.target_message_id
            and target_message.conversation_id = conversation_event.conversation_id
            and target_message.is_deleted = false
            and target_message.source_request_id is null
            and private.can_read_conversation_message(target_message.conversation_id, target_message.created_at)
        )
      )
      or
      (
        conversation_event.event_type in (
          'nickname_changed'::text,
          'nickname_removed'::text,
          'theme_changed'::text
        )
        and conversation_event.created_at > coalesce(v_history_cleared_at, '-infinity'::timestamptz)
      )
    )
  order by conversation_event.created_at desc, conversation_event.id desc
  limit v_page_size;
end;
$$;

revoke all on function public.set_conversation_theme(uuid, text) from public;
revoke all on function public.set_conversation_theme(uuid, text) from anon;
grant execute on function public.set_conversation_theme(uuid, text) to authenticated;

revoke all on function public.list_conversation_events(uuid, integer) from public;
revoke all on function public.list_conversation_events(uuid, integer) from anon;
grant execute on function public.list_conversation_events(uuid, integer) to authenticated;

comment on column public.conversations.theme_key is 'Trusted shared static theme identifier for the conversation UI.';
comment on function public.set_conversation_theme(uuid, text) is 'Idempotently applies a validated shared conversation theme and atomically records a cutoff-safe activity event.';
comment on function public.list_conversation_events(uuid, integer) is 'Returns at most 50 cutoff-safe pin, nickname, and theme activity rows.';

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
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately after applying the migration):
-- select column_name, data_type, column_default, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'conversations'
--   and column_name = 'theme_key';
--
-- select pg_catalog.to_regprocedure('public.set_conversation_theme(uuid,text)') as theme_rpc,
--        pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') as event_list_rpc;
--
-- select has_function_privilege('anon', 'public.set_conversation_theme(uuid,text)', 'execute') as anon_can_set,
--        has_function_privilege('authenticated', 'public.set_conversation_theme(uuid,text)', 'execute') as authenticated_can_set,
--        has_table_privilege('authenticated', 'public.conversations', 'update') as authenticated_can_update_directly;
--
-- select conname, pg_catalog.pg_get_constraintdef(oid)
-- from pg_catalog.pg_constraint
-- where conrelid in ('public.conversations'::regclass, 'public.conversation_events'::regclass)
--   and conname in ('conversations_theme_key_check', 'conversation_events_type_check', 'conversation_events_payload_check')
-- order by conname;
