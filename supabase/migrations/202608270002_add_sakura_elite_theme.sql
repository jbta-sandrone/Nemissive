begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.get_my_premium_access()') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null then
    raise exception 'Sakura requires the premium entitlement and Celestial naming migrations through 202608270001.';
  end if;

  if not exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.celestial'
  ) then
    raise exception 'Sakura requires canonical Celestial migration 202608270001.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'sakura_theme_preview'
  ) or exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.sakura'
  ) or exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.sakura'
      or billing_product.premium_product_id = 'theme.sakura'
  ) then
    raise exception 'Sakura is already registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Development preview remains a private, explicit authorization bypass. It is
-- disabled by default and never creates ownership, Gold status, or Elite.
insert into private.development_feature_flags (flag_key, enabled)
values ('sakura_theme_preview', false);

-- Register only the stable entitlement identity. Sakura intentionally has no
-- billing_product_catalog row until its real Lemon Squeezy product exists.
insert into private.premium_products (product_id, development_preview_flag_key)
values ('theme.sakura', 'sakura_theme_preview');

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
    'celestial',
    'sakura'
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
  v_product_id text;
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
    'celestial',
    'sakura'
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  if v_theme_key not in (
    'default',
    'midnight',
    'ocean',
    'lavender',
    'emerald',
    'rose',
    'sunset'
  ) then
    v_product_id := 'theme.' || v_theme_key;
    if not private.can_access_premium_product(v_actor_id, v_product_id) then
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
  'Stores a caller-local conversation theme. Premium themes use the centralized ownership, active-Elite, or development-preview resolver.';

do $verify$
begin
  if (select pg_catalog.count(*) from private.premium_products where product_id = 'theme.sakura') <> 1
    or (select pg_catalog.count(*) from private.development_feature_flags where flag_key = 'sakura_theme_preview' and not enabled) <> 1 then
    raise exception 'Sakura entitlement registration verification failed.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.sakura'
      or billing_product.premium_product_id = 'theme.sakura'
  ) then
    raise exception 'Sakura must not receive a billing catalog entry before provider setup.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;

-- Verification after applying (run as an administrative SQL role):
-- select product_id, development_preview_flag_key
-- from private.premium_products
-- where product_id = 'theme.sakura';
--
-- select flag_key, enabled
-- from private.development_feature_flags
-- where flag_key = 'sakura_theme_preview';
--
-- select product_id, premium_product_id
-- from private.billing_product_catalog
-- where product_id = 'theme.sakura' or premium_product_id = 'theme.sakura';
-- Expected: no rows until the later Sakura Lemon Squeezy integration.
--
-- select has_schema_privilege('authenticated', 'private', 'usage') as authenticated_private_usage,
--        has_table_privilege('authenticated', 'private.premium_products', 'select') as authenticated_product_read,
--        has_table_privilege('authenticated', 'public.premium_product_ownerships', 'insert,update,delete') as authenticated_ownership_write;
-- Expected: false, false, false.
