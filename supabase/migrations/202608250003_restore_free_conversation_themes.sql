begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null then
    raise exception 'Conversation theme restoration requires the conversation tables.';
  end if;
  if pg_catalog.to_regclass('private.development_feature_flags') is null then
    raise exception 'Conversation theme restoration requires the hosted development preview flag foundation.';
  end if;
  if pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null then
    raise exception 'Conversation theme restoration requires the personal conversation theme functions.';
  end if;
end;
$$;

-- Restore the complete pre-Obsidian free catalog and retain Obsidian as the
-- only premium theme. Existing participant rows are not rewritten.
alter table public.conversation_participants
  drop constraint if exists conversation_participants_theme_key_check;

alter table public.conversation_participants
  add constraint conversation_participants_theme_key_check
  check (theme_key in (
    'default',
    'midnight',
    'ocean',
    'lavender',
    'emerald',
    'rose',
    'sunset',
    'obsidian'
  ));

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
  v_theme_key text;
  v_obsidian_preview_enabled boolean := false;
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
    'obsidian'
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  -- This private flag is temporary development infrastructure, not ownership,
  -- an Elite plan, or a production entitlement. Free themes bypass this gate.
  if v_theme_key = 'obsidian' then
    select feature_flag.enabled
    into v_obsidian_preview_enabled
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'obsidian_theme_preview';

    if not coalesce(v_obsidian_preview_enabled, false) then
      raise exception using errcode = '42501', message = 'This premium conversation theme is not available for this account.';
    end if;
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
  'Stores the caller participant personal theme. Original themes are free; Obsidian temporarily requires the private administrator development flag until permanent ownership and Elite subscription entitlements exist.';

-- Preserve an existing Obsidian preference while making the private flag
-- authoritative for reads too. Disabling preview therefore falls back to
-- Default without destroying the participant's saved preference.
create or replace function public.list_my_personal_conversation_themes()
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
    case
      when participant_row.theme_key = 'obsidian'
        and not coalesce((
          select feature_flag.enabled
          from private.development_feature_flags as feature_flag
          where feature_flag.flag_key = 'obsidian_theme_preview'
        ), false)
      then 'default'
      else participant_row.theme_key
    end as theme_key
  from public.conversation_participants as participant_row
  where participant_row.user_id = auth.uid()
    and private.is_active_account(auth.uid());
$$;

revoke all on function public.list_my_personal_conversation_themes() from public, anon, authenticated;
grant execute on function public.list_my_personal_conversation_themes() to authenticated;

comment on function public.list_my_personal_conversation_themes() is
  'Lists caller-local conversation themes and masks Obsidian to Default while the temporary private development preview flag is disabled.';

notify pgrst, 'reload schema';

commit;

-- Administrative development-project controls (run manually in SQL Editor):
-- Enable:  update private.development_feature_flags set enabled = true where flag_key = 'obsidian_theme_preview';
-- Disable: update private.development_feature_flags set enabled = false where flag_key = 'obsidian_theme_preview';

-- Verification after applying:
-- select conname, pg_catalog.pg_get_constraintdef(oid)
-- from pg_catalog.pg_constraint
-- where conrelid = 'public.conversation_participants'::regclass
--   and conname = 'conversation_participants_theme_key_check';
-- select has_function_privilege('anon', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as anon_can_set_theme,
--        has_function_privilege('authenticated', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as authenticated_can_set_theme;
-- select has_function_privilege('anon', 'public.list_my_personal_conversation_themes()', 'execute') as anon_can_list_themes,
--        has_function_privilege('authenticated', 'public.list_my_personal_conversation_themes()', 'execute') as authenticated_can_list_themes;
-- select has_table_privilege('anon', 'private.development_feature_flags', 'select') as anon_can_read_flags,
--        has_table_privilege('authenticated', 'private.development_feature_flags', 'select') as authenticated_can_read_flags,
--        has_table_privilege('anon', 'private.development_feature_flags', 'update') as anon_can_update_flags,
--        has_table_privilege('authenticated', 'private.development_feature_flags', 'update') as authenticated_can_update_flags;
