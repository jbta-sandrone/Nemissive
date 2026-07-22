begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct',
  direct_key text unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_type_check check (conversation_type in ('direct')),
  constraint conversations_direct_key_check check (conversation_type <> 'direct' or direct_key is not null)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_id_idx on public.conversation_participants(user_id);

create table public.conversation_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  pair_key text not null,
  introduction text not null,
  status text not null default 'pending',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint conversation_requests_different_users_check check (sender_id <> recipient_id),
  constraint conversation_requests_pair_key_check check (pair_key = least(sender_id::text, recipient_id::text) || ':' || greatest(sender_id::text, recipient_id::text)),
  constraint conversation_requests_introduction_check check (introduction = btrim(introduction) and char_length(introduction) between 1 and 500),
  constraint conversation_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint conversation_requests_conversation_status_check check (
    (status = 'accepted' and conversation_id is not null)
    or
    (status <> 'accepted' and conversation_id is null)
  )
);

create unique index conversation_requests_one_pending_pair_idx on public.conversation_requests(pair_key) where status = 'pending';
create index conversation_requests_sender_id_idx on public.conversation_requests(sender_id);
create index conversation_requests_recipient_id_idx on public.conversation_requests(recipient_id);
create index conversation_requests_status_idx on public.conversation_requests(status);
create index conversation_requests_created_at_idx on public.conversation_requests(created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  source_request_id uuid unique references public.conversation_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_body_check check (body = btrim(body) and char_length(body) between 1 and 4000)
);

create index messages_conversation_created_at_idx on public.messages(conversation_id, created_at);
create index messages_sender_id_idx on public.messages(sender_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon;
revoke all on function private.set_updated_at() from authenticated;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function private.set_updated_at();

create trigger conversation_requests_set_updated_at
before update on public.conversation_requests
for each row execute function private.set_updated_at();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function private.set_updated_at();

create or replace function private.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants as participant
    where participant.conversation_id = target_conversation_id
      and participant.user_id = auth.uid()
  );
$$;

revoke all on function private.is_conversation_participant(uuid) from public;
revoke all on function private.is_conversation_participant(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_conversation_participant(uuid) to authenticated;

alter table public.conversation_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy conversation_requests_members_select
on public.conversation_requests
for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy conversations_participants_select
on public.conversations
for select
to authenticated
using (private.is_conversation_participant(id));

create policy conversation_participants_members_select
on public.conversation_participants
for select
to authenticated
using (private.is_conversation_participant(conversation_id));

create policy messages_participants_select
on public.messages
for select
to authenticated
using (private.is_conversation_participant(conversation_id));

revoke all on table public.conversation_requests from public, anon, authenticated;
revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.conversation_participants from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;

grant select on table public.conversation_requests to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_participants to authenticated;
grant select on table public.messages to authenticated;

create or replace function public.create_conversation_request(target_user_id uuid, introduction_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := auth.uid();
  v_introduction text;
  v_pair_key text;
  v_conversation_id uuid;
  v_request public.conversation_requests%rowtype;
  v_created_new boolean := false;
begin
  if v_sender_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_user_id is null then
    raise exception using errcode = '22023', message = 'A target user is required.';
  end if;

  if target_user_id = v_sender_id then
    raise exception using errcode = '22023', message = 'You cannot send a conversation request to yourself.';
  end if;

  v_introduction := pg_catalog.btrim(introduction_text);

  if v_introduction is null or pg_catalog.char_length(v_introduction) = 0 then
    raise exception using errcode = '22023', message = 'An introduction is required.';
  end if;

  if pg_catalog.char_length(v_introduction) > 500 then
    raise exception using errcode = '22023', message = 'The introduction must be 500 characters or fewer.';
  end if;

  if not exists (select 1 from public.profiles as profile where profile.id = target_user_id) then
    raise exception using errcode = '22023', message = 'The selected profile is unavailable.';
  end if;

  v_pair_key := least(v_sender_id::text, target_user_id::text) || ':' || greatest(v_sender_id::text, target_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select conversation.id
  into v_conversation_id
  from public.conversations as conversation
  where conversation.conversation_type = 'direct'
    and conversation.direct_key = v_pair_key
  limit 1;

  if v_conversation_id is not null then
    return pg_catalog.jsonb_build_object(
      'request_id', null,
      'request_status', 'accepted',
      'request_direction', 'existing_conversation',
      'conversation_id', v_conversation_id,
      'created_new', false,
      'introduction', null,
      'created_at', null
    );
  end if;

  select request.*
  into v_request
  from public.conversation_requests as request
  where request.pair_key = v_pair_key
    and request.status = 'pending'
  order by request.created_at
  limit 1;

  if v_request.id is not null then
    return pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'request_status', v_request.status,
      'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end,
      'conversation_id', v_request.conversation_id,
      'created_new', false,
      'introduction', v_request.introduction,
      'created_at', v_request.created_at
    );
  end if;

  begin
    insert into public.conversation_requests (sender_id, recipient_id, pair_key, introduction)
    values (v_sender_id, target_user_id, v_pair_key, v_introduction)
    returning * into v_request;
    v_created_new := true;
  exception
    when unique_violation then
      select request.*
      into v_request
      from public.conversation_requests as request
      where request.pair_key = v_pair_key
        and request.status = 'pending'
      limit 1;
  end;

  if v_request.id is null then
    raise exception using errcode = '40001', message = 'The request could not be created. Please retry.';
  end if;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'request_status', v_request.status,
    'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end,
    'conversation_id', v_request.conversation_id,
    'created_new', v_created_new,
    'introduction', v_request.introduction,
    'created_at', v_request.created_at
  );
end;
$$;

create or replace function public.respond_to_conversation_request(request_id uuid, response_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_responder_id uuid := auth.uid();
  v_action text := pg_catalog.lower(pg_catalog.btrim(response_action));
  v_request public.conversation_requests%rowtype;
  v_conversation_id uuid;
begin
  if v_responder_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if request_id is null then
    raise exception using errcode = '22023', message = 'A request ID is required.';
  end if;

  if v_action is null or v_action not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'The response must be accept or decline.';
  end if;

  select request.*
  into v_request
  from public.conversation_requests as request
  where request.id = $1
    and request.recipient_id = v_responder_id
  for update;

  if v_request.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The conversation request was not found or is unavailable.';
  end if;

  if v_request.status <> 'pending' then
    raise exception using
      errcode = '55000',
      message = 'This conversation request is no longer pending.';
  end if;

  if v_request.id is null then
    raise exception using errcode = 'P0002', message = 'The conversation request was not found.';
  end if;


  if v_request.status <> 'pending' then
    raise exception using errcode = '55000', message = 'This conversation request is no longer pending.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request.pair_key, 0));

  if v_action = 'decline' then
    update public.conversation_requests
    set status = 'declined', responded_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_request.id;

    return pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'request_status', 'declined',
      'conversation_id', null
    );
  end if;

  insert into public.conversations (conversation_type, direct_key, created_by)
  values ('direct', v_request.pair_key, v_request.sender_id)
  on conflict (direct_key) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select conversation.id
    into v_conversation_id
    from public.conversations as conversation
    where conversation.direct_key = v_request.pair_key
      and conversation.conversation_type = 'direct'
    limit 1;
  end if;

  if v_conversation_id is null then
    raise exception using errcode = '55000', message = 'The direct conversation could not be created.';
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_request.sender_id),
    (v_conversation_id, v_request.recipient_id)
  on conflict (conversation_id, user_id) do nothing;

  insert into public.messages (conversation_id, sender_id, body, source_request_id)
  values (v_conversation_id, v_request.sender_id, v_request.introduction, v_request.id)
  on conflict (source_request_id) do nothing;

  update public.conversation_requests
  set status = 'accepted',
      conversation_id = v_conversation_id,
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_request.id;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'request_status', 'accepted',
    'conversation_id', v_conversation_id
  );
end;
$$;

revoke all on function public.create_conversation_request(uuid, text) from public;
revoke all on function public.create_conversation_request(uuid, text) from anon;
grant execute on function public.create_conversation_request(uuid, text) to authenticated;

revoke all on function public.respond_to_conversation_request(uuid, text) from public;
revoke all on function public.respond_to_conversation_request(uuid, text) from anon;
grant execute on function public.respond_to_conversation_request(uuid, text) to authenticated;

comment on table public.conversation_requests is 'One-message introduction requests that gate direct conversations.';
comment on function public.create_conversation_request(uuid, text) is 'Creates or resolves a direct-conversation request for auth.uid().';
comment on function public.respond_to_conversation_request(uuid, text) is 'Atomically accepts or declines a pending request as its recipient.';

commit;
