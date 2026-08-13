begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversation_requests') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('public.create_conversation_request(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.get_my_privacy_preferences()') is null
    or pg_catalog.to_regprocedure('public.set_privacy_preferences(boolean,boolean,boolean)') is null then
    raise exception 'Message request privacy requires the current profile, request, blocking, and privacy preference architecture.';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists message_requests_enabled boolean not null default true;

comment on column public.profiles.message_requests_enabled is 'Whether other authenticated users may create new conversation requests to this profile.';

revoke select (message_requests_enabled) on table public.profiles from public;
revoke select (message_requests_enabled) on table public.profiles from anon;
revoke select (message_requests_enabled) on table public.profiles from authenticated;

create or replace function public.get_my_privacy_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select pg_catalog.jsonb_build_object(
    'active_status_enabled', profile_row.active_status_enabled,
    'last_active_enabled', profile_row.last_active_enabled,
    'read_receipts_enabled', profile_row.read_receipts_enabled,
    'message_request_permission', case when profile_row.message_requests_enabled then 'everyone'::text else 'no_one'::text end
  )
  into v_result
  from public.profiles as profile_row
  where profile_row.id = v_user_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
  return v_result;
end;
$$;

create or replace function public.set_privacy_preferences(
  active_status_enabled boolean,
  last_active_enabled boolean,
  read_receipts_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_status_enabled boolean := active_status_enabled;
  v_last_active_enabled boolean := last_active_enabled;
  v_read_receipts_enabled boolean := read_receipts_enabled;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_active_status_enabled is null or v_last_active_enabled is null or v_read_receipts_enabled is null then
    raise exception using errcode = '22004', message = 'Every privacy preference is required.';
  end if;

  update public.profiles as profile_row
  set active_status_enabled = v_active_status_enabled,
      last_active_enabled = v_last_active_enabled,
      read_receipts_enabled = v_read_receipts_enabled,
      privacy_preferences_revision_at = pg_catalog.clock_timestamp()
  where profile_row.id = v_user_id
  returning pg_catalog.jsonb_build_object(
    'active_status_enabled', profile_row.active_status_enabled,
    'last_active_enabled', profile_row.last_active_enabled,
    'read_receipts_enabled', profile_row.read_receipts_enabled,
    'message_request_permission', case when profile_row.message_requests_enabled then 'everyone'::text else 'no_one'::text end
  ) into v_result;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
  return v_result;
end;
$$;

create or replace function public.set_message_request_permission(message_request_permission text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_permission text := pg_catalog.lower(pg_catalog.btrim(message_request_permission));
  v_enabled boolean;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_permission is null or v_permission not in ('everyone'::text, 'no_one'::text) then
    raise exception using errcode = '22023', message = 'Message request permission must be everyone or no_one.';
  end if;

  v_enabled := v_permission = 'everyone'::text;

  update public.profiles as profile_row
  set message_requests_enabled = v_enabled,
      privacy_preferences_revision_at = pg_catalog.clock_timestamp()
  where profile_row.id = v_user_id
  returning pg_catalog.jsonb_build_object(
    'active_status_enabled', profile_row.active_status_enabled,
    'last_active_enabled', profile_row.last_active_enabled,
    'read_receipts_enabled', profile_row.read_receipts_enabled,
    'message_request_permission', case when profile_row.message_requests_enabled then 'everyone'::text else 'no_one'::text end
  ) into v_result;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
  return v_result;
end;
$$;

create or replace function public.search_profiles_for_conversation(search_text text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  request_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_search_text text := nullif(pg_catalog.btrim(search_text), ''::text);
begin
  if v_viewer_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_search_text is not null and pg_catalog.char_length(v_search_text) > 100 then
    raise exception using errcode = '22023', message = 'Search text must be 100 characters or fewer.';
  end if;

  return query
  select
    profile_row.id,
    profile_row.username,
    profile_row.display_name,
    profile_row.avatar_url,
    profile_row.message_requests_enabled
      and private.users_can_interact(v_viewer_id, profile_row.id)
  from public.profiles as profile_row
  where profile_row.id <> v_viewer_id
    and (
      v_search_text is null
      or (profile_row.username is not null and pg_catalog.strpos(pg_catalog.lower(profile_row.username), pg_catalog.lower(v_search_text)) > 0)
      or (profile_row.display_name is not null and pg_catalog.strpos(pg_catalog.lower(profile_row.display_name), pg_catalog.lower(v_search_text)) > 0)
    )
  order by profile_row.display_name asc nulls last, profile_row.username asc nulls last, profile_row.id
  limit 10;
end;
$$;

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
  v_target_allows_requests boolean;
  v_request public.conversation_requests%rowtype;
  v_created_new boolean := false;
begin
  if v_sender_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_user_id is null then raise exception using errcode = '22023', message = 'A target user is required.'; end if;
  if target_user_id = v_sender_id then raise exception using errcode = '22023', message = 'You cannot send a conversation request to yourself.'; end if;
  v_introduction := pg_catalog.btrim(introduction_text);
  if v_introduction is null or pg_catalog.char_length(v_introduction) = 0 then raise exception using errcode = '22023', message = 'An introduction is required.'; end if;
  if pg_catalog.char_length(v_introduction) > 500 then raise exception using errcode = '22023', message = 'The introduction must be 500 characters or fewer.'; end if;

  v_pair_key := least(v_sender_id::text, target_user_id::text) || ':' || greatest(v_sender_id::text, target_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select target_profile.message_requests_enabled
  into v_target_allows_requests
  from public.profiles as target_profile
  where target_profile.id = target_user_id
  for share;

  if v_target_allows_requests is null then
    raise exception using errcode = '22023', message = 'The selected profile is unavailable.';
  end if;
  if not private.users_can_interact(v_sender_id, target_user_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this profile.';
  end if;

  select conversation_row.id into v_conversation_id
  from public.conversations as conversation_row
  where conversation_row.conversation_type = 'direct'::text and conversation_row.direct_key = v_pair_key
  limit 1;
  if v_conversation_id is not null then
    return pg_catalog.jsonb_build_object('request_id', null, 'request_status', 'accepted', 'request_direction', 'existing_conversation', 'conversation_id', v_conversation_id, 'created_new', false, 'introduction', null, 'created_at', null);
  end if;

  select request_row.* into v_request
  from public.conversation_requests as request_row
  where request_row.pair_key = v_pair_key and request_row.status = 'pending'::text
  order by request_row.created_at limit 1;
  if v_request.id is not null then
    return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', v_request.status, 'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end, 'conversation_id', v_request.conversation_id, 'created_new', false, 'introduction', v_request.introduction, 'created_at', v_request.created_at);
  end if;

  if not v_target_allows_requests then
    raise exception using errcode = '42501', message = 'This person is not accepting new conversation requests right now.';
  end if;

  begin
    insert into public.conversation_requests (sender_id, recipient_id, pair_key, introduction)
    values (v_sender_id, target_user_id, v_pair_key, v_introduction)
    returning * into v_request;
    v_created_new := true;
  exception when unique_violation then
    select request_row.* into v_request
    from public.conversation_requests as request_row
    where request_row.pair_key = v_pair_key and request_row.status = 'pending'::text limit 1;
  end;
  if v_request.id is null then raise exception using errcode = '40001', message = 'The request could not be created. Please retry.'; end if;
  return pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_status', v_request.status, 'request_direction', case when v_request.sender_id = v_sender_id then 'outgoing' else 'incoming' end, 'conversation_id', v_request.conversation_id, 'created_new', v_created_new, 'introduction', v_request.introduction, 'created_at', v_request.created_at);
end;
$$;

revoke all on function public.get_my_privacy_preferences() from public;
revoke all on function public.get_my_privacy_preferences() from anon;
revoke all on function public.get_my_privacy_preferences() from authenticated;
grant execute on function public.get_my_privacy_preferences() to authenticated;

revoke all on function public.set_privacy_preferences(boolean, boolean, boolean) from public;
revoke all on function public.set_privacy_preferences(boolean, boolean, boolean) from anon;
revoke all on function public.set_privacy_preferences(boolean, boolean, boolean) from authenticated;
grant execute on function public.set_privacy_preferences(boolean, boolean, boolean) to authenticated;

revoke all on function public.set_message_request_permission(text) from public;
revoke all on function public.set_message_request_permission(text) from anon;
revoke all on function public.set_message_request_permission(text) from authenticated;
grant execute on function public.set_message_request_permission(text) to authenticated;

revoke all on function public.search_profiles_for_conversation(text) from public;
revoke all on function public.search_profiles_for_conversation(text) from anon;
revoke all on function public.search_profiles_for_conversation(text) from authenticated;
grant execute on function public.search_profiles_for_conversation(text) to authenticated;

revoke all on function public.create_conversation_request(uuid, text) from public;
revoke all on function public.create_conversation_request(uuid, text) from anon;
revoke all on function public.create_conversation_request(uuid, text) from authenticated;
grant execute on function public.create_conversation_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
