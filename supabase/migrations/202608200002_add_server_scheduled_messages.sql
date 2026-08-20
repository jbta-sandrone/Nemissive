begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
  then
    raise exception 'Scheduled messages require the current Nemissive messaging and account-authorization architecture.';
  end if;
end;
$$;

create extension if not exists pg_cron;

create table public.scheduled_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content_snapshot text not null,
  scheduled_for timestamptz not null,
  next_attempt_at timestamptz not null,
  status text not null default 'scheduled'::text,
  attempt_count integer not null default 0,
  message_id uuid unique references public.messages(id) on delete set null,
  failure_code text,
  failure_message text,
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint scheduled_messages_content_check check (
    content_snapshot = pg_catalog.btrim(content_snapshot)
    and pg_catalog.char_length(content_snapshot) between 1 and 2000
  ),
  constraint scheduled_messages_status_check check (
    status in ('scheduled'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text)
  ),
  constraint scheduled_messages_attempt_count_check check (attempt_count between 0 and 3),
  constraint scheduled_messages_failure_code_check check (
    failure_code is null or failure_code in ('messaging_unavailable'::text, 'delivery_retry'::text, 'delivery_failed'::text)
  ),
  constraint scheduled_messages_sent_state_check check (
    status <> 'sent'::text or sent_at is not null
  ),
  constraint scheduled_messages_failed_state_check check (
    status <> 'failed'::text or (failure_code is not null and failure_message is not null and failed_at is not null)
  ),
  constraint scheduled_messages_cancelled_state_check check (
    status <> 'cancelled'::text or cancelled_at is not null
  )
);

create index scheduled_messages_due_idx
on public.scheduled_messages (next_attempt_at, id)
where status = 'scheduled'::text;

create index scheduled_messages_sender_upcoming_idx
on public.scheduled_messages (sender_id, status, scheduled_for, id);

alter table public.scheduled_messages enable row level security;
alter table public.scheduled_messages replica identity full;

revoke all on table public.scheduled_messages from public, anon, authenticated;

create policy scheduled_messages_owner_select
on public.scheduled_messages
for select
to authenticated
using (
  scheduled_messages.sender_id = auth.uid()
  and private.is_active_account(auth.uid())
);

grant select on table public.scheduled_messages to authenticated;

comment on table public.scheduled_messages is
  'Private immutable-at-creation outgoing text snapshots. Privileged RPCs control lifecycle transitions; recipients cannot inspect future delivery.';
comment on column public.scheduled_messages.scheduled_for is
  'Absolute timestamptz delivery instant. Clients convert local date/time selections to an ISO instant before scheduling.';
comment on column public.scheduled_messages.next_attempt_at is
  'Worker eligibility instant. Initially scheduled_for and advanced only by bounded transient retry handling.';

create or replace function private.assert_valid_scheduled_message(
  candidate_content_snapshot text,
  candidate_scheduled_for timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if candidate_content_snapshot is null
    or candidate_content_snapshot <> pg_catalog.btrim(candidate_content_snapshot)
    or pg_catalog.char_length(candidate_content_snapshot) not between 1 and 2000
  then
    raise exception using errcode = '22023', message = 'Scheduled message text must contain between 1 and 2,000 characters.';
  end if;

  if candidate_scheduled_for is null or candidate_scheduled_for < v_now + interval '2 minutes' then
    raise exception using errcode = '22023', message = 'Choose a time at least two minutes from now.';
  end if;

  if candidate_scheduled_for > v_now + interval '1 year' then
    raise exception using errcode = '22023', message = 'Scheduled messages may be planned up to one year ahead.';
  end if;
end;
$$;

revoke all on function private.assert_valid_scheduled_message(text, timestamptz) from public, anon, authenticated;

create or replace function private.can_sender_send_conversation_message(
  target_sender_id uuid,
  target_conversation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_other_user_id uuid;
  v_connection_status text;
  v_pair_key text;
begin
  if target_sender_id is null or target_conversation_id is null then
    return false;
  end if;

  select other_participant.user_id
  into v_other_user_id
  from public.conversation_participants as sender_participant
  join public.conversations as conversation_row
    on conversation_row.id = sender_participant.conversation_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = sender_participant.conversation_id
   and other_participant.user_id <> sender_participant.user_id
  where sender_participant.conversation_id = target_conversation_id
    and sender_participant.user_id = target_sender_id
    and conversation_row.conversation_type = 'direct'::text
  order by other_participant.user_id
  limit 1;

  if v_other_user_id is null then
    return false;
  end if;

  v_pair_key := least(target_sender_id::text, v_other_user_id::text)
    || ':'::text
    || greatest(target_sender_id::text, v_other_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select conversation_row.connection_status
  into v_connection_status
  from public.conversations as conversation_row
  join public.conversation_participants as sender_participant
    on sender_participant.conversation_id = conversation_row.id
   and sender_participant.user_id = target_sender_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = conversation_row.id
   and other_participant.user_id = v_other_user_id
  where conversation_row.id = target_conversation_id
    and conversation_row.conversation_type = 'direct'::text
  for share of conversation_row;

  return v_connection_status = 'accepted'::text
    and private.is_active_account(target_sender_id)
    and private.is_active_account(v_other_user_id)
    and private.users_can_interact(target_sender_id, v_other_user_id);
end;
$$;

revoke all on function private.can_sender_send_conversation_message(uuid, uuid) from public, anon, authenticated;

create or replace function private.execute_scheduled_message(
  target_scheduled_message_id uuid,
  allow_early_delivery boolean
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_schedule public.scheduled_messages%rowtype;
  v_message_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select schedule_row.*
  into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
  for update;

  if v_schedule.id is null then
    return null;
  end if;

  if v_schedule.status = 'sent'::text then
    return v_schedule;
  end if;

  if v_schedule.status <> 'scheduled'::text
    or (not allow_early_delivery and v_schedule.next_attempt_at > v_now)
  then
    return v_schedule;
  end if;

  update public.scheduled_messages as schedule_row
  set status = 'processing'::text,
      attempt_count = least(schedule_row.attempt_count + 1, 3),
      processing_started_at = v_now,
      failure_code = null,
      failure_message = null,
      updated_at = v_now
  where schedule_row.id = v_schedule.id
  returning * into v_schedule;

  begin
    if not private.can_sender_send_conversation_message(v_schedule.sender_id, v_schedule.conversation_id) then
      update public.scheduled_messages as schedule_row
      set status = 'failed'::text,
          failed_at = pg_catalog.clock_timestamp(),
          failure_code = 'messaging_unavailable'::text,
          failure_message = 'Messaging is no longer available for this conversation.'::text,
          processing_started_at = null,
          updated_at = pg_catalog.clock_timestamp()
      where schedule_row.id = v_schedule.id
      returning * into v_schedule;
      return v_schedule;
    end if;

    insert into public.messages (
      conversation_id,
      sender_id,
      body,
      message_type
    )
    values (
      v_schedule.conversation_id,
      v_schedule.sender_id,
      v_schedule.content_snapshot,
      'text'::text
    )
    returning id into v_message_id;

    update public.scheduled_messages as schedule_row
    set status = 'sent'::text,
        message_id = v_message_id,
        sent_at = pg_catalog.clock_timestamp(),
        failed_at = null,
        failure_code = null,
        failure_message = null,
        processing_started_at = null,
        updated_at = pg_catalog.clock_timestamp()
    where schedule_row.id = v_schedule.id
    returning * into v_schedule;
  exception
    when others then
      if v_schedule.attempt_count >= 3 then
        update public.scheduled_messages as schedule_row
        set status = 'failed'::text,
            failed_at = pg_catalog.clock_timestamp(),
            failure_code = 'delivery_failed'::text,
            failure_message = 'Nemissive could not deliver this scheduled message after several attempts.'::text,
            processing_started_at = null,
            updated_at = pg_catalog.clock_timestamp()
        where schedule_row.id = v_schedule.id
        returning * into v_schedule;
      else
        update public.scheduled_messages as schedule_row
        set status = 'scheduled'::text,
            next_attempt_at = pg_catalog.clock_timestamp()
              + case when v_schedule.attempt_count = 1 then interval '1 minute' else interval '5 minutes' end,
            failure_code = 'delivery_retry'::text,
            failure_message = 'Delivery was delayed. Nemissive will retry automatically.'::text,
            processing_started_at = null,
            updated_at = pg_catalog.clock_timestamp()
        where schedule_row.id = v_schedule.id
        returning * into v_schedule;
      end if;
  end;

  return v_schedule;
end;
$$;

revoke all on function private.execute_scheduled_message(uuid, boolean) from public, anon, authenticated;

create or replace function private.process_due_scheduled_messages(batch_size integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(batch_size, 50), 1), 100);
  v_schedule record;
  v_result public.scheduled_messages%rowtype;
  v_claimed integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_retried integer := 0;
begin
  for v_schedule in
    select schedule_row.id
    from public.scheduled_messages as schedule_row
    where schedule_row.status = 'scheduled'::text
      and schedule_row.next_attempt_at <= pg_catalog.clock_timestamp()
    order by schedule_row.next_attempt_at, schedule_row.id
    for update skip locked
    limit v_batch_size
  loop
    v_claimed := v_claimed + 1;
    v_result := private.execute_scheduled_message(v_schedule.id, false);
    if v_result.status = 'sent'::text then v_sent := v_sent + 1;
    elsif v_result.status = 'failed'::text then v_failed := v_failed + 1;
    elsif v_result.status = 'scheduled'::text then v_retried := v_retried + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'claimed', v_claimed,
    'sent', v_sent,
    'failed', v_failed,
    'retried', v_retried
  );
end;
$$;

revoke all on function private.process_due_scheduled_messages(integer) from public, anon, authenticated, service_role;

create or replace function public.schedule_note_message(
  target_conversation_id uuid,
  content_snapshot text,
  scheduled_for timestamptz
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  perform private.assert_valid_scheduled_message(content_snapshot, scheduled_for);

  if not private.can_sender_send_conversation_message(v_actor_id, target_conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.';
  end if;

  insert into public.scheduled_messages (
    sender_id,
    conversation_id,
    content_snapshot,
    scheduled_for,
    next_attempt_at
  )
  values (
    v_actor_id,
    target_conversation_id,
    content_snapshot,
    scheduled_for,
    scheduled_for
  )
  returning * into v_schedule;

  return v_schedule;
end;
$$;

create or replace function public.update_scheduled_message(
  target_scheduled_message_id uuid,
  candidate_content_snapshot text,
  candidate_scheduled_for timestamptz
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  perform private.assert_valid_scheduled_message(candidate_content_snapshot, candidate_scheduled_for);

  select schedule_row.*
  into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
    and schedule_row.sender_id = v_actor_id
  for update;

  if v_schedule.id is null then
    raise exception using errcode = 'P0002', message = 'Scheduled message not found.';
  end if;
  if v_schedule.status <> 'scheduled'::text then
    raise exception using errcode = '55000', message = 'This scheduled message can no longer be changed.';
  end if;

  if not private.can_sender_send_conversation_message(v_actor_id, v_schedule.conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.';
  end if;

  update public.scheduled_messages as schedule_row
  set content_snapshot = candidate_content_snapshot,
      scheduled_for = candidate_scheduled_for,
      next_attempt_at = candidate_scheduled_for,
      attempt_count = 0,
      failure_code = null,
      failure_message = null,
      updated_at = pg_catalog.clock_timestamp()
  where schedule_row.id = v_schedule.id
  returning * into v_schedule;

  return v_schedule;
end;
$$;

create or replace function public.cancel_scheduled_message(target_scheduled_message_id uuid)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select schedule_row.*
  into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
    and schedule_row.sender_id = v_actor_id
  for update;

  if v_schedule.id is null then
    raise exception using errcode = 'P0002', message = 'Scheduled message not found.';
  end if;
  if v_schedule.status = 'cancelled'::text then
    return v_schedule;
  end if;
  if v_schedule.status <> 'scheduled'::text then
    raise exception using errcode = '55000', message = 'This scheduled message can no longer be cancelled.';
  end if;

  update public.scheduled_messages as schedule_row
  set status = 'cancelled'::text,
      cancelled_at = pg_catalog.clock_timestamp(),
      processing_started_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where schedule_row.id = v_schedule.id
  returning * into v_schedule;

  return v_schedule;
end;
$$;

create or replace function public.send_scheduled_message_now(target_scheduled_message_id uuid)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select schedule_row.*
  into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
    and schedule_row.sender_id = v_actor_id
  for update;

  if v_schedule.id is null then
    raise exception using errcode = 'P0002', message = 'Scheduled message not found.';
  end if;
  if v_schedule.status = 'sent'::text then
    return v_schedule;
  end if;
  if v_schedule.status <> 'scheduled'::text then
    raise exception using errcode = '55000', message = 'This scheduled message cannot be sent now.';
  end if;

  return private.execute_scheduled_message(v_schedule.id, true);
end;
$$;

revoke all on function public.schedule_note_message(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.update_scheduled_message(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_scheduled_message(uuid) from public, anon, authenticated;
revoke all on function public.send_scheduled_message_now(uuid) from public, anon, authenticated;

grant execute on function public.schedule_note_message(uuid, text, timestamptz) to authenticated;
grant execute on function public.update_scheduled_message(uuid, text, timestamptz) to authenticated;
grant execute on function public.cancel_scheduled_message(uuid) to authenticated;
grant execute on function public.send_scheduled_message_now(uuid) to authenticated;

create or replace function private.remove_inactive_account_schedules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status in ('deleting'::text, 'deleted'::text)
    and old.account_status is distinct from new.account_status
  then
    delete from public.scheduled_messages as schedule_row
    where schedule_row.sender_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.remove_inactive_account_schedules() from public, anon, authenticated, service_role;

create trigger profiles_remove_inactive_account_schedules
after update of account_status on public.profiles
for each row
execute function private.remove_inactive_account_schedules();

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'scheduled_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.scheduled_messages';
  end if;
end;
$$;

select cron.schedule(
  'nemissive-process-scheduled-messages',
  '* * * * *',
  $cron$select private.process_due_scheduled_messages(50);$cron$
);

notify pgrst, 'reload schema';

commit;

-- Verification (run manually after applying with an administrative SQL role):
-- select extname, extversion from pg_catalog.pg_extension where extname = 'pg_cron';
-- select jobid, jobname, schedule, command, active
-- from cron.job where jobname = 'nemissive-process-scheduled-messages';
-- select status, pg_catalog.count(*) from public.scheduled_messages group by status order by status;
-- select policyname, roles, cmd, qual from pg_catalog.pg_policies
-- where schemaname = 'public' and tablename = 'scheduled_messages';
-- select has_table_privilege('anon', 'public.scheduled_messages', 'select') as anon_can_read,
--        has_table_privilege('authenticated', 'public.scheduled_messages', 'select') as authenticated_can_read,
--        has_table_privilege('authenticated', 'public.scheduled_messages', 'insert,update,delete') as authenticated_can_write_directly;
-- select has_function_privilege('authenticated', 'public.schedule_note_message(uuid,text,timestamptz)', 'execute') as can_schedule,
--        has_function_privilege('authenticated', 'public.update_scheduled_message(uuid,text,timestamptz)', 'execute') as can_update,
--        has_function_privilege('authenticated', 'public.cancel_scheduled_message(uuid)', 'execute') as can_cancel,
--        has_function_privilege('authenticated', 'public.send_scheduled_message_now(uuid)', 'execute') as can_send_now,
--        has_function_privilege('authenticated', 'private.process_due_scheduled_messages(integer)', 'execute') as browser_can_run_worker;
-- select * from cron.job_run_details where jobid in (
--   select jobid from cron.job where jobname = 'nemissive-process-scheduled-messages'
-- ) order by start_time desc limit 20;
-- To pause: select cron.alter_job(job_id := jobid, active := false)
--           from cron.job where jobname = 'nemissive-process-scheduled-messages';
-- To remove: select cron.unschedule(jobid)
--            from cron.job where jobname = 'nemissive-process-scheduled-messages';
