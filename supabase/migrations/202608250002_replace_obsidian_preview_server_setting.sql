begin;

do $$
begin
  if pg_catalog.to_regnamespace('private') is null then
    raise exception 'Hosted Obsidian preview requires the private schema.';
  end if;
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null then
    raise exception 'Hosted Obsidian preview requires conversation tables.';
  end if;
  if pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null then
    raise exception 'Hosted Obsidian preview requires the personal conversation theme foundation.';
  end if;
end;
$$;

create table private.development_feature_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  constraint development_feature_flags_key_check check (
    flag_key = pg_catalog.btrim(flag_key)
    and pg_catalog.char_length(flag_key) between 1 and 100
  )
);

alter table private.development_feature_flags enable row level security;

comment on table private.development_feature_flags is
  'Temporary administrator-controlled development switches. These are not account plans, purchases, ownership records, or production entitlements and should be removed when authoritative entitlements exist.';

revoke all on table private.development_feature_flags from public, anon, authenticated;

insert into private.development_feature_flags (flag_key, enabled)
values ('obsidian_theme_preview', false);

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
  if v_theme_key not in ('default', 'obsidian') then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

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
  'Stores the caller participant personal theme. Obsidian temporarily requires a private administrator-controlled development flag until permanent ownership and Elite subscription entitlements exist.';

notify pgrst, 'reload schema';

commit;

-- Administrative development-project controls (run manually in SQL Editor):
-- Enable:  update private.development_feature_flags set enabled = true where flag_key = 'obsidian_theme_preview';
-- Disable: update private.development_feature_flags set enabled = false where flag_key = 'obsidian_theme_preview';

-- Verification after applying:
-- select flag_key, enabled from private.development_feature_flags where flag_key = 'obsidian_theme_preview';
-- select has_table_privilege('anon', 'private.development_feature_flags', 'select') as anon_can_read_flags,
--        has_table_privilege('authenticated', 'private.development_feature_flags', 'select') as authenticated_can_read_flags,
--        has_table_privilege('anon', 'private.development_feature_flags', 'update') as anon_can_update_flags,
--        has_table_privilege('authenticated', 'private.development_feature_flags', 'update') as authenticated_can_update_flags;
-- select has_function_privilege('anon', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as anon_can_set_theme,
--        has_function_privilege('authenticated', 'public.set_personal_conversation_theme(uuid,text)', 'execute') as authenticated_can_set_theme;
