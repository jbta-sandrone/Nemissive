begin;

do $$
begin
  if pg_catalog.to_regclass('public.reminders') is null
    or pg_catalog.to_regclass('public.reminder_participants') is null
    or pg_catalog.to_regclass('public.conversation_events') is null
    or pg_catalog.to_regprocedure('public.create_reminder(text,text,timestamptz,text,uuid,text,integer)') is null
    or pg_catalog.to_regprocedure('public.list_my_reminders(integer)') is null
    or pg_catalog.to_regprocedure('public.list_conversation_events(uuid,integer)') is null
    or pg_catalog.to_regprocedure('private.reminder_conversation_is_eligible(uuid)') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
  then
    raise exception 'Reminder sharing refinements require the current reminders and conversation activity schema.';
  end if;
end;
$$;

alter table public.reminder_participants
  add column removed_at timestamptz;

comment on column public.reminder_participants.removed_at is
  'Participant-private list removal. This is separate from due-notification dismissal semantics.';

alter table public.conversation_events
  add column target_reminder_id uuid;

alter table public.conversation_events
  add constraint conversation_events_target_reminder_fkey
  foreign key (target_reminder_id)
  references public.reminders(id)
  on delete cascade;

alter table public.conversation_events
  drop constraint if exists conversation_events_type_check,
  drop constraint if exists conversation_events_payload_check,
  drop constraint if exists conversation_events_message_pinned_target_check;

alter table public.conversation_events
  add constraint conversation_events_type_check
    check (event_type in (
      'message_pinned'::text,
      'nickname_changed'::text,
      'nickname_removed'::text,
      'theme_changed'::text,
      'reminder_created'::text
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
      )
      or (
        event_type = 'nickname_changed'::text
        and target_message_id is null
        and target_user_id is not null
        and nickname_value is not null
        and nickname_value = btrim(nickname_value)
        and pg_catalog.char_length(nickname_value) between 1 and 40
        and nickname_value !~ '[[:cntrl:]]'
        and theme_key is null
        and target_reminder_id is null
      )
      or (
        event_type = 'nickname_removed'::text
        and target_message_id is null
        and target_user_id is not null
        and nickname_value is null
        and theme_key is null
        and target_reminder_id is null
      )
      or (
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
        and target_reminder_id is null
      )
      or (
        event_type = 'reminder_created'::text
        and target_message_id is null
        and target_user_id is null
        and nickname_value is null
        and theme_key is null
        and target_reminder_id is not null
      )
    );

create unique index conversation_events_reminder_created_unique
on public.conversation_events (target_reminder_id)
where event_type = 'reminder_created'::text;

create function private.remove_cancelled_reminder_conversation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.lifecycle_status = 'active'::text and new.lifecycle_status = 'cancelled'::text then
    delete from public.conversation_events as event_row
    where event_row.target_reminder_id = new.id
      and event_row.event_type = 'reminder_created'::text;
  end if;
  return new;
end;
$$;

revoke all on function private.remove_cancelled_reminder_conversation_event()
from public, anon, authenticated, service_role;

create trigger reminders_remove_cancelled_conversation_event
after update of lifecycle_status on public.reminders
for each row execute function private.remove_cancelled_reminder_conversation_event();

create or replace function private.can_read_shared_reminder_event(
  target_conversation_id uuid,
  target_reminder_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles as viewer_profile
      join public.conversation_participants as viewer_participant
        on viewer_participant.user_id = viewer_profile.id
       and viewer_participant.conversation_id = target_conversation_id
      join public.reminder_participants as reminder_participant
        on reminder_participant.user_id = viewer_profile.id
       and reminder_participant.reminder_id = target_reminder_id
      join public.reminders as reminder_row
        on reminder_row.id = reminder_participant.reminder_id
       and reminder_row.conversation_id = target_conversation_id
       and reminder_row.scope = 'shared'::text
       and reminder_row.lifecycle_status = 'active'::text
      where viewer_profile.id = auth.uid()
        and viewer_profile.account_status = 'active'::text
        and private.reminder_conversation_is_eligible(target_conversation_id)
    );
$$;

revoke all on function private.can_read_shared_reminder_event(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_read_shared_reminder_event(uuid,uuid) to authenticated;

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
        or (
          conversation_events.event_type in (
            'nickname_changed'::text,
            'nickname_removed'::text,
            'theme_changed'::text
          )
          and conversation_events.created_at > coalesce(viewer.history_cleared_at, '-infinity'::timestamptz)
        )
        or (
          conversation_events.event_type = 'reminder_created'::text
          and conversation_events.created_at > coalesce(viewer.history_cleared_at, '-infinity'::timestamptz)
          and private.can_read_shared_reminder_event(
            conversation_events.conversation_id,
            conversation_events.target_reminder_id
          )
        )
      )
  )
);

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
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;

  select viewer_participant.history_cleared_at
  into v_history_cleared_at
  from public.conversation_participants as viewer_participant
  join public.conversations as conversation_row
    on conversation_row.id = viewer_participant.conversation_id
  where viewer_participant.conversation_id = target_conversation_id
    and viewer_participant.user_id = v_user_id
    and conversation_row.conversation_type = 'direct'::text;

  if not found then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  return query
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
    event_row.created_at
  from public.conversation_events as event_row
  left join public.reminders as reminder_row
    on reminder_row.id = event_row.target_reminder_id
  where event_row.conversation_id = target_conversation_id
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
      )
      or (
        event_row.event_type in (
          'nickname_changed'::text,
          'nickname_removed'::text,
          'theme_changed'::text
        )
        and event_row.created_at > coalesce(v_history_cleared_at, '-infinity'::timestamptz)
      )
      or (
        event_row.event_type = 'reminder_created'::text
        and event_row.created_at > coalesce(v_history_cleared_at, '-infinity'::timestamptz)
        and private.can_read_shared_reminder_event(event_row.conversation_id, event_row.target_reminder_id)
      )
    )
  order by event_row.created_at desc, event_row.id desc
  limit v_page_size;
end;
$$;

revoke all on function public.list_conversation_events(uuid,integer) from public, anon, authenticated;
grant execute on function public.list_conversation_events(uuid,integer) to authenticated;

drop function public.list_my_reminders(integer);
create function public.list_my_reminders(page_size integer default 250)
returns table (
  id uuid,
  creator_id uuid,
  conversation_id uuid,
  scope text,
  title text,
  details text,
  due_at timestamptz,
  schedule_kind text,
  timer_duration_minutes integer,
  lifecycle_status text,
  created_at timestamptz,
  updated_at timestamptz,
  personal_status text,
  snoozed_until timestamptz,
  dismissed_at timestamptz,
  completed_at timestamptz,
  notified_at timestamptz,
  notification_version integer,
  removed_at timestamptz,
  creator_display_name text,
  creator_username text,
  creator_avatar_url text,
  conversation_peer_id uuid,
  conversation_peer_display_name text,
  conversation_peer_username text,
  conversation_peer_avatar_url text,
  participant_count integer,
  completed_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    reminder_row.id,
    reminder_row.creator_id,
    reminder_row.conversation_id,
    reminder_row.scope,
    reminder_row.title,
    reminder_row.details,
    reminder_row.due_at,
    reminder_row.schedule_kind,
    reminder_row.timer_duration_minutes,
    reminder_row.lifecycle_status,
    reminder_row.created_at,
    reminder_row.updated_at,
    own_participant.personal_status,
    own_participant.snoozed_until,
    own_participant.dismissed_at,
    own_participant.completed_at,
    own_participant.notified_at,
    own_participant.notification_version,
    own_participant.removed_at,
    creator_profile.display_name,
    creator_profile.username,
    creator_profile.avatar_url,
    peer_profile.id,
    peer_profile.display_name,
    peer_profile.username,
    peer_profile.avatar_url,
    (select pg_catalog.count(*)::integer from public.reminder_participants as participant_count_row where participant_count_row.reminder_id = reminder_row.id),
    (select pg_catalog.count(*)::integer from public.reminder_participants as completed_row where completed_row.reminder_id = reminder_row.id and completed_row.personal_status = 'completed'::text)
  from public.reminder_participants as own_participant
  join public.reminders as reminder_row on reminder_row.id = own_participant.reminder_id
  join public.profiles as creator_profile on creator_profile.id = reminder_row.creator_id
  left join public.conversation_participants as peer_participant
    on peer_participant.conversation_id = reminder_row.conversation_id
   and peer_participant.user_id <> auth.uid()
  left join public.profiles as peer_profile on peer_profile.id = peer_participant.user_id
  where own_participant.user_id = auth.uid()
    and reminder_row.lifecycle_status = 'active'::text
  order by reminder_row.due_at asc, reminder_row.id asc
  limit least(greatest(coalesce(page_size, 250), 1), 500);
$$;

revoke all on function public.list_my_reminders(integer) from public, anon, authenticated;
grant execute on function public.list_my_reminders(integer) to authenticated;

create or replace function public.create_reminder(
  candidate_title text,
  candidate_details text,
  candidate_due_at timestamptz,
  candidate_scope text,
  target_conversation_id uuid default null,
  candidate_schedule_kind text default 'date_time'::text,
  candidate_timer_duration_minutes integer default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reminder_id uuid;
  v_effective_due_at timestamptz;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles as profile_row
    where profile_row.id = v_user_id and profile_row.account_status = 'active'::text
  ) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;
  perform private.assert_valid_reminder_input(candidate_title, candidate_details, candidate_due_at, candidate_schedule_kind, candidate_timer_duration_minutes);
  v_effective_due_at := case when candidate_schedule_kind = 'timer'::text
    then pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => candidate_timer_duration_minutes)
    else candidate_due_at end;
  if candidate_scope not in ('personal'::text, 'shared'::text) then
    raise exception using errcode = '22023', message = 'Choose For you or Share in chat.';
  end if;
  if candidate_scope = 'personal'::text and target_conversation_id is not null then
    raise exception using errcode = '22023', message = 'A personal reminder cannot target a conversation.';
  end if;
  if candidate_scope = 'shared'::text and (
    not private.reminder_conversation_is_eligible(target_conversation_id)
    or not exists (
      select 1 from public.conversation_participants as participant_row
      where participant_row.conversation_id = target_conversation_id and participant_row.user_id = v_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'That conversation is not available for shared reminders.';
  end if;

  insert into public.reminders (
    creator_id, conversation_id, scope, title, details, due_at, schedule_kind, timer_duration_minutes
  ) values (
    v_user_id,
    case when candidate_scope = 'shared'::text then target_conversation_id else null end,
    candidate_scope,
    pg_catalog.regexp_replace(btrim(candidate_title), '\s+'::text, ' '::text, 'g'::text),
    candidate_details,
    v_effective_due_at,
    candidate_schedule_kind,
    candidate_timer_duration_minutes
  ) returning reminders.id into v_reminder_id;

  if candidate_scope = 'personal'::text then
    insert into public.reminder_participants (reminder_id, user_id) values (v_reminder_id, v_user_id);
  else
    insert into public.reminder_participants (reminder_id, user_id)
    select v_reminder_id, participant_row.user_id
    from public.conversation_participants as participant_row
    join public.profiles as profile_row
      on profile_row.id = participant_row.user_id and profile_row.account_status = 'active'::text
    where participant_row.conversation_id = target_conversation_id;

    insert into public.conversation_events (
      conversation_id,
      actor_id,
      event_type,
      target_reminder_id
    ) values (
      target_conversation_id,
      v_user_id,
      'reminder_created'::text,
      v_reminder_id
    );
  end if;

  return v_reminder_id;
end;
$$;

revoke all on function public.create_reminder(text,text,timestamptz,text,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.create_reminder(text,text,timestamptz,text,uuid,text,integer) to authenticated;

create or replace function public.remove_reminder_for_me(target_reminder_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.reminder_participants%rowtype;
  v_scope text;
  v_lifecycle_status text;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select participant_row.*
  into v_participant
  from public.reminder_participants as participant_row
  where participant_row.reminder_id = target_reminder_id
    and participant_row.user_id = v_user_id
  for update;

  select reminder_row.scope, reminder_row.lifecycle_status
  into v_scope, v_lifecycle_status
  from public.reminders as reminder_row
  where reminder_row.id = target_reminder_id;

  if v_participant.reminder_id is null or v_lifecycle_status <> 'active'::text then
    raise exception using errcode = 'P0002', message = 'Reminder not found.';
  end if;
  if v_scope <> 'shared'::text then
    raise exception using errcode = '22023', message = 'Only shared reminders can be removed from your list.';
  end if;
  if v_participant.personal_status not in ('completed'::text, 'dismissed'::text) then
    raise exception using errcode = '55000', message = 'Complete or dismiss this shared reminder before removing it.';
  end if;

  update public.reminder_participants as participant_row
  set removed_at = coalesce(participant_row.removed_at, pg_catalog.clock_timestamp())
  where participant_row.reminder_id = target_reminder_id
    and participant_row.user_id = v_user_id;
  return true;
end;
$$;

create or replace function public.delete_shared_reminder_for_everyone(target_reminder_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reminder public.reminders%rowtype;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select reminder_row.* into v_reminder
  from public.reminders as reminder_row
  where reminder_row.id = target_reminder_id
  for update;

  if v_reminder.id is null or v_reminder.lifecycle_status <> 'active'::text then
    raise exception using errcode = 'P0002', message = 'Reminder not found.';
  end if;
  if v_reminder.scope <> 'shared'::text or v_reminder.creator_id <> v_user_id then
    raise exception using errcode = '42501', message = 'Only the creator can delete this shared reminder for everyone.';
  end if;

  delete from public.reminders as reminder_row where reminder_row.id = target_reminder_id;
  return true;
end;
$$;

create or replace function public.clear_completed_reminders()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_personal_deleted integer := 0;
  v_shared_removed integer := 0;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  with deleted_personal as (
    delete from public.reminders as reminder_row
    using public.reminder_participants as participant_row
    where reminder_row.id = participant_row.reminder_id
      and reminder_row.creator_id = v_user_id
      and reminder_row.scope = 'personal'::text
      and reminder_row.lifecycle_status = 'active'::text
      and participant_row.user_id = v_user_id
      and participant_row.personal_status = 'completed'::text
    returning reminder_row.id
  )
  select pg_catalog.count(*)::integer into v_personal_deleted from deleted_personal;

  update public.reminder_participants as participant_row
  set removed_at = coalesce(participant_row.removed_at, pg_catalog.clock_timestamp())
  from public.reminders as reminder_row
  where reminder_row.id = participant_row.reminder_id
    and participant_row.user_id = v_user_id
    and participant_row.personal_status = 'completed'::text
    and participant_row.removed_at is null
    and reminder_row.scope = 'shared'::text
    and reminder_row.lifecycle_status = 'active'::text;
  get diagnostics v_shared_removed = row_count;

  return pg_catalog.jsonb_build_object(
    'personal_deleted', v_personal_deleted,
    'shared_removed', v_shared_removed
  );
end;
$$;

revoke all on function public.remove_reminder_for_me(uuid) from public, anon, authenticated;
revoke all on function public.delete_shared_reminder_for_everyone(uuid) from public, anon, authenticated;
revoke all on function public.clear_completed_reminders() from public, anon, authenticated;
grant execute on function public.remove_reminder_for_me(uuid) to authenticated;
grant execute on function public.delete_shared_reminder_for_everyone(uuid) to authenticated;
grant execute on function public.clear_completed_reminders() to authenticated;

comment on function public.remove_reminder_for_me(uuid) is
  'Hides one completed or dismissed shared reminder only for the authenticated participant.';
comment on function public.delete_shared_reminder_for_everyone(uuid) is
  'Permanently deletes a shared reminder only when called by its creator.';
comment on function public.clear_completed_reminders() is
  'Deletes caller-owned completed personal reminders and hides completed shared reminders only for the caller.';

notify pgrst, 'reload schema';

commit;

-- Verification (run with an administrative SQL role after applying):
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'reminder_participants' and column_name = 'removed_at';
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'conversation_events' and column_name = 'target_reminder_id';
-- select pg_catalog.to_regprocedure('public.remove_reminder_for_me(uuid)'),
--        pg_catalog.to_regprocedure('public.delete_shared_reminder_for_everyone(uuid)'),
--        pg_catalog.to_regprocedure('public.clear_completed_reminders()');
-- select has_function_privilege('anon', 'public.clear_completed_reminders()', 'execute') as anon_can_clear,
--        has_function_privilege('authenticated', 'public.clear_completed_reminders()', 'execute') as authenticated_can_clear;
