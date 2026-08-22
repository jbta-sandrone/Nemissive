begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.user_blocks') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
  then
    raise exception 'One-time reminders require the current account, conversation, and blocking schema.';
  end if;
  if pg_catalog.to_regnamespace('cron') is null then
    raise exception 'One-time reminders require the existing pg_cron scheduling infrastructure.';
  end if;
end;
$$;

create table public.reminders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  scope text not null,
  title text not null,
  details text not null default ''::text,
  due_at timestamptz not null,
  schedule_kind text not null default 'date_time'::text,
  timer_duration_minutes integer,
  lifecycle_status text not null default 'active'::text,
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint reminders_scope_check check (scope in ('personal'::text, 'shared'::text)),
  constraint reminders_scope_conversation_check check (
    (scope = 'personal'::text and conversation_id is null)
    or (scope = 'shared'::text and conversation_id is not null)
  ),
  constraint reminders_title_check check (
    title = btrim(title) and pg_catalog.char_length(title) between 1 and 80
  ),
  constraint reminders_details_check check (pg_catalog.char_length(details) <= 500),
  constraint reminders_schedule_kind_check check (schedule_kind in ('date_time'::text, 'timer'::text)),
  constraint reminders_timer_check check (
    (schedule_kind = 'date_time'::text and timer_duration_minutes is null)
    or (schedule_kind = 'timer'::text and timer_duration_minutes between 1 and 525600)
  ),
  constraint reminders_lifecycle_check check (lifecycle_status in ('active'::text, 'cancelled'::text)),
  constraint reminders_cancelled_state_check check (
    (lifecycle_status = 'active'::text and cancelled_at is null)
    or (lifecycle_status = 'cancelled'::text and cancelled_at is not null)
  )
);

create table public.reminder_participants (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  personal_status text not null default 'pending'::text,
  snoozed_until timestamptz,
  dismissed_at timestamptz,
  completed_at timestamptz,
  notified_at timestamptz,
  notification_version integer not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (reminder_id, user_id),
  constraint reminder_participants_status_check check (
    personal_status in ('pending'::text, 'due'::text, 'snoozed'::text, 'dismissed'::text, 'completed'::text)
  ),
  constraint reminder_participants_snooze_check check (
    (personal_status = 'snoozed'::text and snoozed_until is not null)
    or (personal_status <> 'snoozed'::text and snoozed_until is null)
  ),
  constraint reminder_participants_dismissed_check check (
    (personal_status = 'dismissed'::text and dismissed_at is not null)
    or (personal_status <> 'dismissed'::text and dismissed_at is null)
  ),
  constraint reminder_participants_completed_check check (
    (personal_status = 'completed'::text and completed_at is not null)
    or (personal_status <> 'completed'::text and completed_at is null)
  ),
  constraint reminder_participants_notification_version_check check (notification_version >= 0)
);

create index reminders_creator_due_idx on public.reminders (creator_id, due_at, id);
create index reminders_conversation_due_idx on public.reminders (conversation_id, due_at, id)
where lifecycle_status = 'active'::text and conversation_id is not null;
create index reminders_worker_due_idx on public.reminders (due_at, id)
where lifecycle_status = 'active'::text;
create index reminder_participants_user_status_idx
on public.reminder_participants (user_id, personal_status, updated_at desc, reminder_id);
create index reminder_participants_snoozed_idx
on public.reminder_participants (snoozed_until, reminder_id, user_id)
where personal_status = 'snoozed'::text;

alter table public.reminders enable row level security;
alter table public.reminder_participants enable row level security;
revoke all on table public.reminders from public, anon, authenticated;
revoke all on table public.reminder_participants from public, anon, authenticated;

create policy reminders_participant_select
on public.reminders for select to authenticated
using (
  exists (
    select 1
    from public.reminder_participants as participant_row
    where participant_row.reminder_id = reminders.id
      and participant_row.user_id = auth.uid()
  )
);

create policy reminder_participants_owner_select
on public.reminder_participants for select to authenticated
using (reminder_participants.user_id = auth.uid());

grant select on table public.reminders to authenticated;
grant select on table public.reminder_participants to authenticated;

comment on table public.reminders is
  'One-time personal or accepted-conversation reminders. Shared content and time live here; recurrence is intentionally unsupported.';
comment on table public.reminder_participants is
  'Private per-participant due, snooze, dismiss, and completion state. A participant can read only their own row.';

create or replace function private.touch_reminder_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function private.touch_reminder_updated_at() from public, anon, authenticated, service_role;

create trigger reminders_touch_updated_at
before update on public.reminders
for each row execute function private.touch_reminder_updated_at();

create trigger reminder_participants_touch_updated_at
before update on public.reminder_participants
for each row execute function private.touch_reminder_updated_at();

create or replace function private.touch_reminder_completion_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.personal_status is distinct from new.personal_status
    and (old.personal_status = 'completed'::text or new.personal_status = 'completed'::text)
  then
    update public.reminders as reminder_row
    set updated_at = pg_catalog.clock_timestamp()
    where reminder_row.id = new.reminder_id;
  end if;
  return new;
end;
$$;

revoke all on function private.touch_reminder_completion_summary() from public, anon, authenticated, service_role;

create trigger reminder_participants_touch_completion_summary
after update of personal_status on public.reminder_participants
for each row execute function private.touch_reminder_completion_summary();

create or replace function private.reminder_conversation_is_eligible(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_conversation_id is not null
    and exists (
      select 1
      from public.conversations as conversation_row
      where conversation_row.id = target_conversation_id
        and conversation_row.conversation_type = 'direct'::text
        and conversation_row.connection_status = 'accepted'::text
        and (
          select pg_catalog.count(*)
          from public.conversation_participants as participant_row
          join public.profiles as profile_row
            on profile_row.id = participant_row.user_id
           and profile_row.account_status = 'active'::text
          where participant_row.conversation_id = conversation_row.id
        ) = 2
        and not exists (
          select 1
          from public.conversation_participants as left_participant
          join public.conversation_participants as right_participant
            on right_participant.conversation_id = left_participant.conversation_id
           and right_participant.user_id <> left_participant.user_id
          where left_participant.conversation_id = conversation_row.id
            and not private.users_can_interact(left_participant.user_id, right_participant.user_id)
        )
    );
$$;

revoke all on function private.reminder_conversation_is_eligible(uuid) from public, anon, authenticated, service_role;

create or replace function private.assert_valid_reminder_input(
  candidate_title text,
  candidate_details text,
  candidate_due_at timestamptz,
  candidate_schedule_kind text,
  candidate_timer_duration_minutes integer
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_effective_due_at timestamptz;
begin
  if candidate_title is null or pg_catalog.char_length(btrim(candidate_title)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Reminder title must be between 1 and 80 characters.';
  end if;
  if candidate_details is null or pg_catalog.char_length(candidate_details) > 500 then
    raise exception using errcode = '22023', message = 'Reminder details must be 500 characters or fewer.';
  end if;
  v_effective_due_at := case
    when candidate_schedule_kind = 'timer'::text and candidate_timer_duration_minutes is not null
      then v_now + pg_catalog.make_interval(mins => candidate_timer_duration_minutes)
    else candidate_due_at
  end;
  if v_effective_due_at is null or v_effective_due_at < v_now + interval '1 minute' then
    raise exception using errcode = '22023', message = 'Choose a reminder time at least one minute from now.';
  end if;
  if v_effective_due_at > v_now + interval '1 year' then
    raise exception using errcode = '22023', message = 'Reminders may be scheduled up to one year ahead.';
  end if;
  if candidate_schedule_kind not in ('date_time'::text, 'timer'::text) then
    raise exception using errcode = '22023', message = 'Choose Date & time or Timer.';
  end if;
  if (candidate_schedule_kind = 'date_time'::text and candidate_timer_duration_minutes is not null)
    or (candidate_schedule_kind = 'timer'::text and (candidate_timer_duration_minutes is null or candidate_timer_duration_minutes not between 1 and 525600))
  then
    raise exception using errcode = '22023', message = 'Choose a valid one-time timer duration.';
  end if;
end;
$$;

revoke all on function private.assert_valid_reminder_input(text,text,timestamptz,text,integer)
from public, anon, authenticated, service_role;

create or replace function public.list_my_reminders(page_size integer default 250)
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
  end if;

  return v_reminder_id;
end;
$$;

create or replace function public.update_reminder(
  target_reminder_id uuid,
  candidate_title text,
  candidate_details text,
  candidate_due_at timestamptz,
  candidate_schedule_kind text,
  candidate_timer_duration_minutes integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reminder public.reminders%rowtype;
  v_effective_due_at timestamptz;
begin
  perform private.assert_valid_reminder_input(candidate_title, candidate_details, candidate_due_at, candidate_schedule_kind, candidate_timer_duration_minutes);
  v_effective_due_at := case when candidate_schedule_kind = 'timer'::text
    then pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => candidate_timer_duration_minutes)
    else candidate_due_at end;
  select reminder_row.* into v_reminder
  from public.reminders as reminder_row
  where reminder_row.id = target_reminder_id
  for update;
  if v_reminder.id is null then raise exception using errcode = 'P0002', message = 'Reminder not found.'; end if;
  if v_reminder.creator_id <> v_user_id then raise exception using errcode = '42501', message = 'Only the creator can edit this reminder.'; end if;
  if v_reminder.lifecycle_status <> 'active'::text or v_reminder.due_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '55000', message = 'This reminder can no longer be changed.';
  end if;
  if v_reminder.scope = 'shared'::text and not private.reminder_conversation_is_eligible(v_reminder.conversation_id) then
    raise exception using errcode = '42501', message = 'This shared reminder is no longer available.';
  end if;
  update public.reminders as reminder_row
  set title = pg_catalog.regexp_replace(btrim(candidate_title), '\s+'::text, ' '::text, 'g'::text), details = candidate_details, due_at = v_effective_due_at,
      schedule_kind = candidate_schedule_kind, timer_duration_minutes = candidate_timer_duration_minutes
  where reminder_row.id = target_reminder_id;
  return target_reminder_id;
end;
$$;

create or replace function public.remove_reminder(target_reminder_id uuid)
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
  select reminder_row.* into v_reminder
  from public.reminders as reminder_row
  where reminder_row.id = target_reminder_id
  for update;
  if v_reminder.id is null then raise exception using errcode = 'P0002', message = 'Reminder not found.'; end if;
  if v_reminder.creator_id <> v_user_id then raise exception using errcode = '42501', message = 'Only the creator can remove this reminder.'; end if;
  if v_reminder.scope = 'personal'::text then
    delete from public.reminders as reminder_row where reminder_row.id = target_reminder_id;
  else
    update public.reminders as reminder_row
    set lifecycle_status = 'cancelled'::text, cancelled_at = pg_catalog.clock_timestamp()
    where reminder_row.id = target_reminder_id and reminder_row.lifecycle_status = 'active'::text;
  end if;
  return true;
end;
$$;

create or replace function private.assert_reminder_participant_action(target_reminder_id uuid, target_user_id uuid)
returns public.reminder_participants
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant public.reminder_participants%rowtype;
  v_reminder public.reminders%rowtype;
begin
  select participant_row.* into v_participant
  from public.reminder_participants as participant_row
  where participant_row.reminder_id = target_reminder_id and participant_row.user_id = target_user_id
  for update;
  select reminder_row.* into v_reminder from public.reminders as reminder_row where reminder_row.id = target_reminder_id;
  if v_participant.reminder_id is null or v_reminder.lifecycle_status <> 'active'::text then
    raise exception using errcode = 'P0002', message = 'Reminder not found.';
  end if;
  if v_reminder.scope = 'shared'::text and not private.reminder_conversation_is_eligible(v_reminder.conversation_id) then
    update public.reminders as reminder_row
    set lifecycle_status = 'cancelled'::text, cancelled_at = pg_catalog.clock_timestamp()
    where reminder_row.id = target_reminder_id and reminder_row.lifecycle_status = 'active'::text;
    raise exception using errcode = '55000', message = 'This shared reminder is no longer available.';
  end if;
  return v_participant;
end;
$$;

revoke all on function private.assert_reminder_participant_action(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.snooze_reminder(target_reminder_id uuid, snooze_minutes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.reminder_participants%rowtype;
begin
  if v_user_id is null or snooze_minutes not between 1 and 10080 then
    raise exception using errcode = '22023', message = 'Choose a snooze duration between one minute and seven days.';
  end if;
  v_participant := private.assert_reminder_participant_action(target_reminder_id, v_user_id);
  if v_participant.personal_status <> 'due'::text then
    raise exception using errcode = '55000', message = 'Only a due reminder can be snoozed.';
  end if;
  update public.reminder_participants as participant_row
  set personal_status = 'snoozed'::text,
      snoozed_until = pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => snooze_minutes),
      dismissed_at = null, completed_at = null, notified_at = null
  where participant_row.reminder_id = target_reminder_id and participant_row.user_id = v_user_id;
  return true;
end;
$$;

create or replace function public.dismiss_reminder(target_reminder_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_participant public.reminder_participants%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  v_participant := private.assert_reminder_participant_action(target_reminder_id, v_user_id);
  if v_participant.personal_status not in ('due'::text, 'snoozed'::text) then
    raise exception using errcode = '55000', message = 'This reminder is not waiting for dismissal.';
  end if;
  update public.reminder_participants as participant_row
  set personal_status = 'dismissed'::text, snoozed_until = null,
      dismissed_at = pg_catalog.clock_timestamp(), completed_at = null
  where participant_row.reminder_id = target_reminder_id and participant_row.user_id = v_user_id;
  return true;
end;
$$;

create or replace function public.complete_reminder(target_reminder_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_participant public.reminder_participants%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  v_participant := private.assert_reminder_participant_action(target_reminder_id, v_user_id);
  if v_participant.personal_status = 'completed'::text then return true; end if;
  update public.reminder_participants as participant_row
  set personal_status = 'completed'::text, snoozed_until = null, dismissed_at = null,
      completed_at = pg_catalog.clock_timestamp()
  where participant_row.reminder_id = target_reminder_id and participant_row.user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.list_my_reminders(integer) from public, anon, authenticated;
revoke all on function public.create_reminder(text,text,timestamptz,text,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.update_reminder(uuid,text,text,timestamptz,text,integer) from public, anon, authenticated;
revoke all on function public.remove_reminder(uuid) from public, anon, authenticated;
revoke all on function public.snooze_reminder(uuid,integer) from public, anon, authenticated;
revoke all on function public.dismiss_reminder(uuid) from public, anon, authenticated;
revoke all on function public.complete_reminder(uuid) from public, anon, authenticated;
grant execute on function public.list_my_reminders(integer) to authenticated;
grant execute on function public.create_reminder(text,text,timestamptz,text,uuid,text,integer) to authenticated;
grant execute on function public.update_reminder(uuid,text,text,timestamptz,text,integer) to authenticated;
grant execute on function public.remove_reminder(uuid) to authenticated;
grant execute on function public.snooze_reminder(uuid,integer) to authenticated;
grant execute on function public.dismiss_reminder(uuid) to authenticated;
grant execute on function public.complete_reminder(uuid) to authenticated;

create or replace function private.process_due_reminders(batch_size integer default 500)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cancelled integer := 0;
  v_due integer := 0;
  v_resnoozed integer := 0;
begin
  with invalid_reminders as (
    select reminder_row.id
    from public.reminders as reminder_row
    join public.profiles as creator_profile on creator_profile.id = reminder_row.creator_id
    where reminder_row.lifecycle_status = 'active'::text
      and (
        creator_profile.account_status <> 'active'::text
        or (reminder_row.scope = 'shared'::text and not private.reminder_conversation_is_eligible(reminder_row.conversation_id))
      )
    order by reminder_row.due_at, reminder_row.id
    limit least(greatest(coalesce(batch_size, 500), 1), 1000)
    for update of reminder_row skip locked
  )
  update public.reminders as reminder_row
  set lifecycle_status = 'cancelled'::text, cancelled_at = pg_catalog.clock_timestamp()
  from invalid_reminders
  where reminder_row.id = invalid_reminders.id;
  get diagnostics v_cancelled = row_count;

  with due_participants as (
    select participant_row.reminder_id, participant_row.user_id
    from public.reminder_participants as participant_row
    join public.reminders as reminder_row on reminder_row.id = participant_row.reminder_id
    join public.profiles as participant_profile on participant_profile.id = participant_row.user_id
    where participant_row.personal_status = 'pending'::text
      and reminder_row.lifecycle_status = 'active'::text
      and reminder_row.due_at <= pg_catalog.clock_timestamp()
      and participant_profile.account_status = 'active'::text
    order by reminder_row.due_at, participant_row.reminder_id, participant_row.user_id
    limit least(greatest(coalesce(batch_size, 500), 1), 1000)
    for update of participant_row skip locked
  )
  update public.reminder_participants as participant_row
  set personal_status = 'due'::text, notified_at = pg_catalog.clock_timestamp(),
      notification_version = participant_row.notification_version + 1
  from due_participants
  where participant_row.reminder_id = due_participants.reminder_id
    and participant_row.user_id = due_participants.user_id;
  get diagnostics v_due = row_count;

  with snoozed_participants as (
    select participant_row.reminder_id, participant_row.user_id
    from public.reminder_participants as participant_row
    join public.reminders as reminder_row on reminder_row.id = participant_row.reminder_id
    join public.profiles as participant_profile on participant_profile.id = participant_row.user_id
    where participant_row.personal_status = 'snoozed'::text
      and participant_row.snoozed_until <= pg_catalog.clock_timestamp()
      and reminder_row.lifecycle_status = 'active'::text
      and participant_profile.account_status = 'active'::text
    order by participant_row.snoozed_until, participant_row.reminder_id, participant_row.user_id
    limit least(greatest(coalesce(batch_size, 500), 1), 1000)
    for update of participant_row skip locked
  )
  update public.reminder_participants as participant_row
  set personal_status = 'due'::text, snoozed_until = null,
      notified_at = pg_catalog.clock_timestamp(), notification_version = participant_row.notification_version + 1
  from snoozed_participants
  where participant_row.reminder_id = snoozed_participants.reminder_id
    and participant_row.user_id = snoozed_participants.user_id;
  get diagnostics v_resnoozed = row_count;

  return pg_catalog.jsonb_build_object('cancelled', v_cancelled, 'due', v_due, 'snooze_due', v_resnoozed);
end;
$$;

revoke all on function private.process_due_reminders(integer) from public, anon, authenticated, service_role;

create or replace function private.remove_inactive_account_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status in ('deleting'::text, 'deleted'::text)
    and old.account_status is distinct from new.account_status
  then
    delete from public.reminders as reminder_row
    where reminder_row.creator_id = new.id and reminder_row.scope = 'personal'::text;
    update public.reminders as reminder_row
    set lifecycle_status = 'cancelled'::text, cancelled_at = pg_catalog.clock_timestamp()
    where reminder_row.creator_id = new.id
      and reminder_row.scope = 'shared'::text
      and reminder_row.lifecycle_status = 'active'::text;
    delete from public.reminder_participants as participant_row where participant_row.user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.remove_inactive_account_reminders() from public, anon, authenticated, service_role;

create trigger profiles_remove_inactive_account_reminders
after update of account_status on public.profiles
for each row execute function private.remove_inactive_account_reminders();

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication as publication_row where publication_row.pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public' and publication_table.tablename = 'reminders'
    ) then execute 'alter publication supabase_realtime add table public.reminders'; end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public' and publication_table.tablename = 'reminder_participants'
    ) then execute 'alter publication supabase_realtime add table public.reminder_participants'; end if;
  end if;
end;
$$;

select cron.schedule(
  'nemissive-process-due-reminders',
  '* * * * *',
  $cron$select private.process_due_reminders(500);$cron$
);

notify pgrst, 'reload schema';

commit;

-- Verification (run with an administrative SQL role after applying):
-- select jobid, jobname, schedule, command, active from cron.job where jobname = 'nemissive-process-due-reminders';
-- select policyname, roles, cmd from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('reminders', 'reminder_participants');
-- select has_table_privilege('anon', 'public.reminders', 'select') as anon_can_read,
--        has_table_privilege('authenticated', 'public.reminders', 'insert,update,delete') as browser_can_write;
-- select has_function_privilege('authenticated', 'private.process_due_reminders(integer)', 'execute') as browser_can_run_worker;
