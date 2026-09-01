begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.conversation_events') is null
    or pg_catalog.to_regnamespace('private') is null then
    raise exception 'Conversation activity retention requires the current conversation-events architecture.';
  end if;

  if pg_catalog.to_regnamespace('cron') is null
    or pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null
    or pg_catalog.to_regprocedure('cron.unschedule(bigint)') is null then
    raise exception 'Conversation activity retention requires the existing pg_cron scheduling infrastructure.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_events'
      and column_name = 'created_at'
      and data_type = 'timestamp with time zone'
  ) then
    raise exception 'Conversation activity retention requires conversation_events.created_at timestamptz.';
  end if;
end;
$preflight$;

create index if not exists conversation_events_created_at_retention_idx
on public.conversation_events (created_at);

create or replace function private.cleanup_expired_conversation_activity()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  deleted_count integer;
begin
  delete from public.conversation_events as event_row
  where event_row.created_at < pg_catalog.now() - interval '30 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$function$;

revoke all on function private.cleanup_expired_conversation_activity()
from public, anon, authenticated, service_role;

comment on function private.cleanup_expired_conversation_activity() is
  'Internal daily maintenance: deletes only conversation activity events strictly older than 30 days and returns the deleted row count.';

do $schedule$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'nemissive-conversation-activity-retention'
  loop
    if not cron.unschedule(existing_job.jobid) then
      raise exception 'Could not replace existing conversation activity retention cron job %.', existing_job.jobid;
    end if;
  end loop;

  perform cron.schedule(
    'nemissive-conversation-activity-retention',
    '17 3 * * *',
    $command$select private.cleanup_expired_conversation_activity();$command$
  );
end;
$schedule$;

do $verify$
begin
  if pg_catalog.to_regprocedure('private.cleanup_expired_conversation_activity()') is null then
    raise exception 'Conversation activity cleanup function registration failed.';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'private.cleanup_expired_conversation_activity()',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'private.cleanup_expired_conversation_activity()',
    'execute'
  ) then
    raise exception 'Conversation activity cleanup function must not be browser-executable.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'conversation_events'
      and indexname = 'conversation_events_created_at_retention_idx'
  ) then
    raise exception 'Conversation activity retention index registration failed.';
  end if;

  if (
    select pg_catalog.count(*)
    from cron.job
    where jobname = 'nemissive-conversation-activity-retention'
  ) <> 1 or (
    select pg_catalog.count(*)
    from cron.job
    where jobname = 'nemissive-conversation-activity-retention'
      and schedule = '17 3 * * *'
      and command = 'select private.cleanup_expired_conversation_activity();'
      and active
  ) <> 1 then
    raise exception 'Conversation activity retention cron registration failed.';
  end if;
end;
$verify$;

commit;
