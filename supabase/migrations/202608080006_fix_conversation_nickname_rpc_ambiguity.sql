begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_nicknames') is null
    or pg_catalog.to_regclass('public.conversation_events') is null
    or pg_catalog.to_regprocedure('public.set_conversation_nickname(uuid,uuid,text)') is null then
    raise exception 'Apply 202608080005_add_shared_conversation_nicknames.sql before this repair.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.conversation_nicknames'::regclass
      and constraint_record.conname = 'conversation_nicknames_pkey'::name
      and constraint_record.contype = 'p'::"char"
  ) then
    raise exception 'The conversation_nicknames primary-key constraint is unavailable.';
  end if;
end;
$$;

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
  join public.conversations as target_conversation
    on target_conversation.id = target_participant.conversation_id
  where target_participant.conversation_id = target_conversation_id
    and target_participant.user_id = target_user_id
    and target_conversation.conversation_type = 'direct'::text
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

  select saved_nickname.nickname
  into v_existing_nickname
  from public.conversation_nicknames as saved_nickname
  where saved_nickname.conversation_id = target_conversation_id
    and saved_nickname.user_id = target_user_id;

  if v_normalized_nickname is not distinct from v_existing_nickname then
    return query
    select target_conversation_id, target_user_id, v_existing_nickname, v_actor_id, v_changed_at;
    return;
  end if;

  if v_normalized_nickname is null then
    delete from public.conversation_nicknames as saved_nickname
    where saved_nickname.conversation_id = target_conversation_id
      and saved_nickname.user_id = target_user_id;

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
    insert into public.conversation_nicknames as inserted_nickname (
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
    on conflict on constraint conversation_nicknames_pkey do update
      set nickname = v_normalized_nickname,
          updated_by = v_actor_id,
          updated_at = v_changed_at;

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

revoke all on function public.set_conversation_nickname(uuid, uuid, text) from public;
revoke all on function public.set_conversation_nickname(uuid, uuid, text) from anon;
grant execute on function public.set_conversation_nickname(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately after applying this migration):
-- select pg_catalog.pg_get_functiondef(
--   'public.set_conversation_nickname(uuid,uuid,text)'::regprocedure
-- );
--
-- select has_function_privilege(
--          'anon',
--          'public.set_conversation_nickname(uuid,uuid,text)',
--          'execute'
--        ) as anon_can_execute,
--        has_function_privilege(
--          'authenticated',
--          'public.set_conversation_nickname(uuid,uuid,text)',
--          'execute'
--        ) as authenticated_can_execute;
