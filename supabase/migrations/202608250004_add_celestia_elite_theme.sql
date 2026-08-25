begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null then
    raise exception 'Celestia requires the personal conversation theme tables.';
  end if;
  if pg_catalog.to_regclass('private.development_feature_flags') is null then
    raise exception 'Celestia requires the private development feature flag foundation.';
  end if;
  if pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.list_my_personal_conversation_themes()') is null then
    raise exception 'Celestia requires the personal conversation theme functions.';
  end if;
end;
$$;

-- This private administrator switch is development-only infrastructure. It is
-- not an Elite plan, purchase, permanent ownership record, or client setting.
insert into private.development_feature_flags (flag_key, enabled)
values ('celestia_theme_preview', false)
on conflict (flag_key) do nothing;

-- Preserve all existing participant values and extend the forward constraint.
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
    'obsidian',
    'celestia'
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
  v_theme_preview_enabled boolean := false;
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
    'obsidian',
    'celestia'
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  -- Each premium theme is gated independently. Permanent ownership and Elite
  -- subscription checks replace these temporary flags when entitlements exist.
  if v_theme_key in ('obsidian', 'celestia') then
    select feature_flag.enabled
    into v_theme_preview_enabled
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = case v_theme_key
      when 'obsidian' then 'obsidian_theme_preview'
      when 'celestia' then 'celestia_theme_preview'
    end;

    if not coalesce(v_theme_preview_enabled, false) then
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
  'Stores the caller participant personal theme. Free themes remain generally available; each premium theme requires its own temporary private development flag until authoritative entitlements exist.';

-- A disabled preview masks only its corresponding premium theme on reads. The
-- saved participant preference remains intact for a future authorized session.
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
      when participant_row.theme_key = 'celestia'
        and not coalesce((
          select feature_flag.enabled
          from private.development_feature_flags as feature_flag
          where feature_flag.flag_key = 'celestia_theme_preview'
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
  'Lists caller-local conversation themes and independently masks unavailable premium previews to Default without destroying saved preferences.';

notify pgrst, 'reload schema';

commit;

-- Administrative development-project controls (run manually in SQL Editor):
-- Enable Celestia:  update private.development_feature_flags set enabled = true where flag_key = 'celestia_theme_preview';
-- Disable Celestia: update private.development_feature_flags set enabled = false where flag_key = 'celestia_theme_preview';

-- Verification after applying:
-- select flag_key, enabled
-- from private.development_feature_flags
-- where flag_key in ('obsidian_theme_preview', 'celestia_theme_preview')
-- order by flag_key;
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
