begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversation_events') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.list_my_personal_conversation_themes()') is null
    or pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.can_read_shared_reminder_event(uuid,uuid)') is null then
    raise exception 'Shared themes and Activity Center require the current conversation, premium-access, and reminder activity schema.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'theme_key'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_participants'
      and column_name = 'theme_key'
  ) then
    raise exception 'Expected shared and participant-local theme columns are unavailable.';
  end if;
end;
$preflight$;

alter table public.conversations
  drop constraint if exists conversations_theme_key_check,
  add constraint conversations_theme_key_check
  check (theme_key in (
    'default',
    'midnight',
    'ocean',
    'lavender',
    'emerald',
    'rose',
    'sunset',
    'obsidian',
    'celestial',
    'sakura',
    'ember',
    'glacier',
    'verdant',
    'abyss',
    'eclipse',
    'dune',
    'void',
    'shinkai'
  ));

-- Resolve the temporary participant-local model into the older conversation-owned
-- source of truth before removing the competing participant column. A meaningful
-- legacy shared value wins. Otherwise one distinct non-default participant value
-- is preserved; conflicting participant values fall back deterministically to
-- Default because no participant preference timestamp exists.
with participant_theme_summary as (
  select
    participant_row.conversation_id,
    pg_catalog.count(distinct participant_row.theme_key)
      filter (where participant_row.theme_key <> 'default'::text) as non_default_count,
    pg_catalog.min(participant_row.theme_key)
      filter (where participant_row.theme_key <> 'default'::text) as sole_non_default_theme
  from public.conversation_participants as participant_row
  group by participant_row.conversation_id
)
update public.conversations as conversation_row
set theme_key = case
  when conversation_row.theme_key <> 'default'::text then conversation_row.theme_key
  when theme_summary.non_default_count = 1 then theme_summary.sole_non_default_theme
  else 'default'::text
end
from participant_theme_summary as theme_summary
where theme_summary.conversation_id = conversation_row.id
  and conversation_row.conversation_type = 'direct'::text;

alter table public.conversation_events
  drop constraint if exists conversation_events_type_check,
  drop constraint if exists conversation_events_payload_check,
  drop constraint if exists conversation_events_message_pinned_target_check;

alter table public.conversation_events
  add constraint conversation_events_type_check
  check (event_type in (
    'message_pinned',
    'nickname_changed',
    'nickname_removed',
    'theme_changed',
    'reminder_created'
  )),
  add constraint conversation_events_payload_check
  check (
    (
      event_type = 'message_pinned'::text
      and target_message_id is not null
      and target_user_id is null
      and nickname_value is null
      and theme_key is null
      and target_reminder_id is null
    ) or (
      event_type = 'nickname_changed'::text
      and target_message_id is null
      and target_user_id is not null
      and nickname_value is not null
      and nickname_value = pg_catalog.btrim(nickname_value)
      and pg_catalog.char_length(nickname_value) between 1 and 40
      and nickname_value !~ '[[:cntrl:]]'
      and theme_key is null
      and target_reminder_id is null
    ) or (
      event_type = 'nickname_removed'::text
      and target_message_id is null
      and target_user_id is not null
      and nickname_value is null
      and theme_key is null
      and target_reminder_id is null
    ) or (
      event_type = 'theme_changed'::text
      and target_message_id is null
      and target_user_id is null
      and nickname_value is null
      and theme_key in (
        'default',
        'midnight',
        'ocean',
        'lavender',
        'emerald',
        'rose',
        'sunset',
        'obsidian',
        'celestial',
        'sakura',
        'ember',
        'glacier',
        'verdant',
        'abyss',
        'eclipse',
        'dune',
        'void',
        'shinkai'
      )
      and target_reminder_id is null
    ) or (
      event_type = 'reminder_created'::text
      and target_message_id is null
      and target_user_id is null
      and nickname_value is null
      and theme_key is null
      and target_reminder_id is not null
    )
  );

alter table public.conversation_participants
  add column last_activity_seen_at timestamptz;

update public.conversation_participants
set last_activity_seen_at = pg_catalog.clock_timestamp()
where last_activity_seen_at is null;

alter table public.conversation_participants
  alter column last_activity_seen_at set default pg_catalog.now(),
  alter column last_activity_seen_at set not null;

revoke select (last_activity_seen_at) on table public.conversation_participants from public, anon, authenticated;
revoke update (last_activity_seen_at) on table public.conversation_participants from public, anon, authenticated;

comment on column public.conversation_participants.last_activity_seen_at is
  'Participant-private watermark for conversation activity. Opening Activity Center advances only the caller row.';

create function private.can_read_conversation_activity_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and private.is_active_account(auth.uid())
    and exists (
      select 1
      from public.conversation_events as event_row
      join public.conversation_participants as viewer_participant
        on viewer_participant.conversation_id = event_row.conversation_id
       and viewer_participant.user_id = auth.uid()
      join public.conversations as conversation_row
        on conversation_row.id = event_row.conversation_id
      where event_row.id = target_event_id
        and conversation_row.conversation_type = 'direct'::text
        and conversation_row.connection_status = 'accepted'::text
        and (
          (
            event_row.event_type = 'message_pinned'::text
            and exists (
              select 1
              from public.messages as message_row
              where message_row.id = event_row.target_message_id
                and message_row.conversation_id = event_row.conversation_id
                and message_row.is_deleted = false
                and message_row.source_request_id is null
                and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
            )
          ) or (
            event_row.event_type in ('nickname_changed'::text, 'nickname_removed'::text, 'theme_changed'::text)
            and event_row.created_at > coalesce(viewer_participant.history_cleared_at, '-infinity'::timestamptz)
          ) or (
            event_row.event_type = 'reminder_created'::text
            and event_row.created_at > coalesce(viewer_participant.history_cleared_at, '-infinity'::timestamptz)
            and private.can_read_shared_reminder_event(event_row.conversation_id, event_row.target_reminder_id)
          )
        )
    );
$$;

revoke all on function private.can_read_conversation_activity_event(uuid)
from public, anon, authenticated, service_role;
grant execute on function private.can_read_conversation_activity_event(uuid) to authenticated;

drop policy if exists conversation_events_participants_select on public.conversation_events;
create policy conversation_events_participants_select
on public.conversation_events
for select
to authenticated
using (private.can_read_conversation_activity_event(id));

create function private.advance_actor_conversation_activity_watermark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants as participant_row
  set last_activity_seen_at = case
    when new.created_at > participant_row.last_activity_seen_at then new.created_at
    else participant_row.last_activity_seen_at
  end
  where participant_row.conversation_id = new.conversation_id
    and participant_row.user_id = new.actor_id;
  return new;
end;
$$;

revoke all on function private.advance_actor_conversation_activity_watermark()
from public, anon, authenticated, service_role;

create trigger conversation_events_advance_actor_watermark
after insert on public.conversation_events
for each row execute function private.advance_actor_conversation_activity_watermark();

drop function public.set_conversation_theme(uuid, text);
create function public.set_conversation_theme(
  target_conversation_id uuid,
  requested_theme_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_theme_key text;
  v_product_id text;
  v_current_theme_key text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'This account is unavailable.';
  end if;
  if target_conversation_id is null or requested_theme_key is null then
    raise exception using errcode = '22023', message = 'A conversation and theme are required.';
  end if;

  v_theme_key := pg_catalog.btrim(requested_theme_key);
  if v_theme_key not in (
    'default',
    'midnight',
    'ocean',
    'lavender',
    'emerald',
    'rose',
    'sunset',
    'obsidian',
    'celestial',
    'sakura',
    'ember',
    'glacier',
    'verdant',
    'abyss',
    'eclipse',
    'dune',
    'void',
    'shinkai'
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  if v_theme_key not in ('default', 'midnight', 'ocean', 'lavender', 'emerald', 'rose', 'sunset') then
    v_product_id := 'theme.' || v_theme_key;
    if not private.can_access_premium_product(v_actor_id, v_product_id) then
      raise exception using errcode = '42501', message = 'This premium conversation theme is not available for this account.';
    end if;
  end if;

  select conversation_row.theme_key
  into v_current_theme_key
  from public.conversations as conversation_row
  join public.conversation_participants as actor_participant
    on actor_participant.conversation_id = conversation_row.id
   and actor_participant.user_id = v_actor_id
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text
    and conversation_row.connection_status = 'accepted'::text
  for update of conversation_row;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  if v_current_theme_key = v_theme_key then
    return v_current_theme_key;
  end if;

  update public.conversations as conversation_row
  set theme_key = v_theme_key
  where conversation_row.id = target_conversation_id;

  insert into public.conversation_events (
    conversation_id,
    actor_id,
    event_type,
    theme_key
  ) values (
    target_conversation_id,
    v_actor_id,
    'theme_changed'::text,
    v_theme_key
  );

  return v_theme_key;
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
  target_reminder_id uuid,
  reminder_title text,
  reminder_due_at timestamptz,
  created_at timestamptz,
  unseen_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_page_size integer := coalesce(page_size, 50);
  v_last_activity_seen_at timestamptz;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;

  select viewer_participant.last_activity_seen_at
  into v_last_activity_seen_at
  from public.conversation_participants as viewer_participant
  join public.conversations as conversation_row
    on conversation_row.id = viewer_participant.conversation_id
  where viewer_participant.conversation_id = target_conversation_id
    and viewer_participant.user_id = v_user_id
    and conversation_row.conversation_type = 'direct'::text
    and conversation_row.connection_status = 'accepted'::text;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  return query
  with recent_events as materialized (
    select event_row.*
    from public.conversation_events as event_row
    where event_row.conversation_id = target_conversation_id
      and private.can_read_conversation_activity_event(event_row.id)
    order by event_row.created_at desc, event_row.id desc
    limit v_page_size
  )
  select
    event_row.id,
    event_row.conversation_id,
    event_row.actor_id,
    event_row.event_type,
    event_row.target_message_id,
    event_row.target_user_id,
    event_row.nickname_value,
    event_row.theme_key,
    event_row.target_reminder_id,
    reminder_row.title,
    reminder_row.due_at,
    event_row.created_at,
    (
      select pg_catalog.count(*)::integer
      from public.conversation_events as unseen_event
      where unseen_event.conversation_id = target_conversation_id
        and unseen_event.created_at > v_last_activity_seen_at
        and private.can_read_conversation_activity_event(unseen_event.id)
    )
  from recent_events as event_row
  left join public.reminders as reminder_row
    on reminder_row.id = event_row.target_reminder_id
  order by event_row.created_at desc, event_row.id desc
  ;
end;
$$;

create function public.mark_conversation_activity_seen(target_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_seen_at timestamptz;
  v_latest_visible_at timestamptz;
  v_saved_seen_at timestamptz;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;

  select viewer_participant.last_activity_seen_at
  into v_current_seen_at
  from public.conversation_participants as viewer_participant
  join public.conversations as conversation_row
    on conversation_row.id = viewer_participant.conversation_id
  where viewer_participant.conversation_id = target_conversation_id
    and viewer_participant.user_id = v_user_id
    and conversation_row.conversation_type = 'direct'::text
    and conversation_row.connection_status = 'accepted'::text
  for update of viewer_participant;

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  select event_row.created_at
  into v_latest_visible_at
  from public.conversation_events as event_row
  where event_row.conversation_id = target_conversation_id
    and private.can_read_conversation_activity_event(event_row.id)
  order by event_row.created_at desc, event_row.id desc
  limit 1;

  update public.conversation_participants as participant_row
  set last_activity_seen_at = case
    when coalesce(v_latest_visible_at, participant_row.last_activity_seen_at) > participant_row.last_activity_seen_at
      then coalesce(v_latest_visible_at, participant_row.last_activity_seen_at)
    else participant_row.last_activity_seen_at
  end
  where participant_row.conversation_id = target_conversation_id
    and participant_row.user_id = v_user_id
  returning participant_row.last_activity_seen_at into v_saved_seen_at;

  return coalesce(v_saved_seen_at, v_current_seen_at);
end;
$$;

revoke all on function public.set_conversation_theme(uuid, text) from public, anon, authenticated;
revoke all on function public.list_conversation_events(uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_conversation_activity_seen(uuid) from public, anon, authenticated;
grant execute on function public.set_conversation_theme(uuid, text) to authenticated;
grant execute on function public.list_conversation_events(uuid, integer) to authenticated;
grant execute on function public.mark_conversation_activity_seen(uuid) to authenticated;

drop function public.set_personal_conversation_theme(uuid, text);
drop function public.list_my_personal_conversation_themes();

alter table public.conversation_participants
  drop constraint if exists conversation_participants_theme_key_check,
  drop column theme_key;

comment on column public.conversations.theme_key is
  'Authoritative shared conversation theme. Viewing it does not grant premium ownership or apply entitlement.';
comment on function public.set_conversation_theme(uuid, text) is
  'Applies one shared direct-conversation theme after caller membership, active-account, accepted-state, and actor premium-access checks.';
comment on function public.list_conversation_events(uuid, integer) is
  'Returns at most 50 presentation-safe accepted-conversation events plus the caller unseen count.';
comment on function public.mark_conversation_activity_seen(uuid) is
  'Advances only auth.uid() participant activity watermark to the latest currently visible event.';

do $verify$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_participants'
      and column_name = 'theme_key'
  ) or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is not null
    or pg_catalog.to_regprocedure('public.list_my_personal_conversation_themes()') is not null then
    raise exception 'Participant-local theme source was not retired.';
  end if;

  if pg_catalog.to_regprocedure('public.set_conversation_theme(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') is null
    or pg_catalog.to_regprocedure('public.mark_conversation_activity_seen(uuid)') is null then
    raise exception 'Shared theme or Activity Center RPC verification failed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
