begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null then
    raise exception 'Personal conversation themes require public.conversation_participants.';
  end if;
  if pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null then
    raise exception 'Personal conversation themes require private.is_active_account(uuid).';
  end if;
end;
$$;

alter table public.conversation_participants
  add column theme_key text not null default 'default';

alter table public.conversation_participants
  add constraint conversation_participants_theme_key_check
  check (theme_key in ('default', 'obsidian'));

comment on column public.conversation_participants.theme_key is
  'Private conversation appearance preference for this participant. It is not a shared conversation setting or proof of theme entitlement.';

-- The RPC remains the only browser write path. Production Obsidian access is
-- rejected until permanent ownership and Elite subscription entitlements can
-- be verified authoritatively on the server. Local development may opt in with
-- the explicit server setting app.settings.enable_obsidian_preview = true.
create or replace function public.set_personal_conversation_theme(
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
  v_theme_key text := pg_catalog.btrim(requested_theme_key);
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
  if v_theme_key not in ('default', 'obsidian') then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;
  if v_theme_key = 'obsidian'
    and coalesce(pg_catalog.current_setting('app.settings.enable_obsidian_preview', true), 'false') <> 'true' then
    raise exception using errcode = '42501', message = 'This premium conversation theme is not available for this account.';
  end if;

  update public.conversation_participants as participant_row
  set theme_key = v_theme_key
  from public.conversations as conversation_row
  where participant_row.conversation_id = target_conversation_id
    and participant_row.user_id = v_actor_id
    and conversation_row.id = participant_row.conversation_id
    and conversation_row.conversation_type = 'direct'
    and conversation_row.connection_status = 'accepted';

  if not found then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;

  return v_theme_key;
end;
$$;

revoke all on function public.set_personal_conversation_theme(uuid, text) from public, anon, authenticated;
grant execute on function public.set_personal_conversation_theme(uuid, text) to authenticated;
comment on function public.set_personal_conversation_theme(uuid, text) is
  'Stores the caller participant personal theme. Premium access must be authorized server-side; the development preview setting is off by default.';

create function public.list_my_personal_conversation_themes()
returns table (
  conversation_id uuid,
  theme_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    participant_row.conversation_id,
    participant_row.theme_key
  from public.conversation_participants as participant_row
  where participant_row.user_id = auth.uid()
    and private.is_active_account(auth.uid());
$$;

revoke all on function public.list_my_personal_conversation_themes() from public, anon, authenticated;
grant execute on function public.list_my_personal_conversation_themes() to authenticated;

-- theme_key deliberately receives no direct SELECT/UPDATE grant and is not
-- added to the Realtime publication. Another participant must not observe this
-- preference through table reads or replication payloads.
notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select * from public.list_my_personal_conversation_themes();
-- select has_column_privilege('authenticated', 'public.conversation_participants', 'theme_key', 'select') as can_read_raw_theme;
-- select has_column_privilege('authenticated', 'public.conversation_participants', 'theme_key', 'update') as can_write_raw_theme;
-- select has_function_privilege('anon', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as anon_can_set_theme;
-- select has_function_privilege('authenticated', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as member_can_set_theme;
