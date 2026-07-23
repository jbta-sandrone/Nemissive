begin;

alter table public.conversation_participants
add column last_delivered_at timestamptz,
add column last_read_at timestamptz;

comment on column public.conversation_participants.last_delivered_at is 'Newest incoming message timestamp this participant client has persistently acknowledged receiving.';
comment on column public.conversation_participants.last_read_at is 'Newest incoming message timestamp this participant has viewed in an active, visible conversation.';

revoke update on table public.conversation_participants from public, anon, authenticated;

create or replace function public.advance_conversation_receipts(
  target_conversation_id uuid,
  delivered_through timestamptz default null,
  read_through timestamptz default null
)
returns table (
  conversation_id uuid,
  user_id uuid,
  last_delivered_at timestamptz,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.conversation_participants%rowtype;
  v_delivered_candidate timestamptz;
  v_read_candidate timestamptz;
  v_next_delivered_at timestamptz;
  v_next_read_at timestamptz;
  v_clock_skew_limit timestamptz := pg_catalog.now() + interval '5 minutes';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A conversation ID is required.';
  end if;

  if delivered_through is null and read_through is null then
    raise exception using errcode = '22023', message = 'A delivery or read timestamp is required.';
  end if;

  if delivered_through > v_clock_skew_limit or read_through > v_clock_skew_limit then
    raise exception using errcode = '22023', message = 'Receipt timestamps cannot be in the future.';
  end if;

  select participant.*
  into v_participant
  from public.conversation_participants as participant
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
  for update;

  if v_participant.user_id is null then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if delivered_through is not null then
    select pg_catalog.max(message.created_at)
    into v_delivered_candidate
    from public.messages as message
    where message.conversation_id = target_conversation_id
      and message.sender_id <> v_user_id
      and message.created_at <= delivered_through;
  end if;

  if read_through is not null then
    select pg_catalog.max(message.created_at)
    into v_read_candidate
    from public.messages as message
    where message.conversation_id = target_conversation_id
      and message.sender_id <> v_user_id
      and message.created_at <= read_through;
  end if;

  v_next_read_at := v_participant.last_read_at;
  if v_read_candidate is not null and (v_next_read_at is null or v_read_candidate > v_next_read_at) then
    v_next_read_at := v_read_candidate;
  end if;

  v_next_delivered_at := v_participant.last_delivered_at;
  if v_participant.last_read_at is not null and (v_next_delivered_at is null or v_participant.last_read_at > v_next_delivered_at) then
    v_next_delivered_at := v_participant.last_read_at;
  end if;
  if v_delivered_candidate is not null and (v_next_delivered_at is null or v_delivered_candidate > v_next_delivered_at) then
    v_next_delivered_at := v_delivered_candidate;
  end if;
  if v_next_read_at is not null and (v_next_delivered_at is null or v_next_read_at > v_next_delivered_at) then
    v_next_delivered_at := v_next_read_at;
  end if;

  if v_next_delivered_at is distinct from v_participant.last_delivered_at
    or v_next_read_at is distinct from v_participant.last_read_at then
    update public.conversation_participants as participant
    set last_delivered_at = v_next_delivered_at,
        last_read_at = v_next_read_at
    where participant.conversation_id = target_conversation_id
      and participant.user_id = v_user_id;
  end if;

  return query
  select
    participant.conversation_id,
    participant.user_id,
    participant.last_delivered_at,
    participant.last_read_at
  from public.conversation_participants as participant
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id;
end;
$$;

revoke all on function public.advance_conversation_receipts(uuid, timestamptz, timestamptz) from public;
revoke all on function public.advance_conversation_receipts(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.advance_conversation_receipts(uuid, timestamptz, timestamptz) to authenticated;

comment on function public.advance_conversation_receipts(uuid, timestamptz, timestamptz) is 'Monotonically advances auth.uid() delivery/read cursors using only real incoming message timestamps.';

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
      and tablename = 'conversation_participants'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_participants';
  end if;
end;
$$;

commit;
