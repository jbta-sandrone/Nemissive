begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.billing_purchases') is null
    or pg_catalog.to_regclass('private.billing_subscriptions') is null
    or pg_catalog.to_regclass('private.billing_webhook_events') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null then
    raise exception 'Celestial naming correction requires migrations through 202608260001.';
  end if;

  if not exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'celestia_theme_preview'
  ) or not exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.celestia'
  ) or not exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.celestia'
      and billing_product.premium_product_id = 'theme.celestia'
      and billing_product.billing_type = 'one_time'
  ) then
    raise exception 'The legacy Celestia catalog state is incomplete.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'celestial_theme_preview'
  ) or exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.celestial'
  ) or exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.celestial'
  ) then
    raise exception 'The canonical Celestial catalog identity already exists; verify migration history before retrying.';
  end if;
end;
$$;

-- Create the canonical parent rows before moving any restrictive foreign-key
-- children. The preview value and product/catalog creation timestamps survive
-- the naming correction unchanged.
insert into private.development_feature_flags (flag_key, enabled)
select 'celestial_theme_preview', feature_flag.enabled
from private.development_feature_flags as feature_flag
where feature_flag.flag_key = 'celestia_theme_preview';

insert into private.premium_products (
  product_id,
  development_preview_flag_key,
  created_at
)
select
  'theme.celestial',
  'celestial_theme_preview',
  product_row.created_at
from private.premium_products as product_row
where product_row.product_id = 'theme.celestia';

insert into private.billing_product_catalog (
  product_id,
  billing_type,
  premium_product_id,
  account_plan,
  display_amount_minor,
  currency,
  billing_interval,
  created_at
)
select
  'theme.celestial',
  billing_product.billing_type,
  'theme.celestial',
  billing_product.account_plan,
  billing_product.display_amount_minor,
  billing_product.currency,
  billing_product.billing_interval,
  billing_product.created_at
from private.billing_product_catalog as billing_product
where billing_product.product_id = 'theme.celestia';

-- Move all entitlement and provider-history children without recreating them.
-- Ownership provenance, acquisition time, provider IDs, stale-event timestamps,
-- refund state, amounts, and test/live markers remain unchanged.
update public.premium_product_ownerships as ownership_row
set product_id = 'theme.celestial'
where ownership_row.product_id = 'theme.celestia';

update private.billing_purchases as purchase_row
set billing_product_id = 'theme.celestial'
where purchase_row.billing_product_id = 'theme.celestia';

update private.billing_subscriptions as subscription_row
set billing_product_id = 'theme.celestial'
where subscription_row.billing_product_id = 'theme.celestia';

update private.billing_webhook_events as webhook_row
set billing_product_id = 'theme.celestial'
where webhook_row.billing_product_id = 'theme.celestia';

delete from private.billing_product_catalog as billing_product
where billing_product.product_id = 'theme.celestia';

delete from private.premium_products as product_row
where product_row.product_id = 'theme.celestia';

delete from private.development_feature_flags as feature_flag
where feature_flag.flag_key = 'celestia_theme_preview';

-- The table lock taken by this constraint replacement prevents a concurrent
-- write from introducing a legacy key between the data update and final check.
alter table public.conversation_participants
  drop constraint if exists conversation_participants_theme_key_check;

update public.conversation_participants as participant_row
set theme_key = 'celestial'
where participant_row.theme_key = 'celestia';

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
    'celestial'
  ));

-- Preserve the existing participant-local authorization behavior. The only
-- change is the canonical theme key/product identity.
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
    'celestial'
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

do $$
begin
  if exists (
    select 1 from public.conversation_participants where theme_key = 'celestia'
  ) or exists (
    select 1 from public.premium_product_ownerships where product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.billing_purchases where billing_product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.billing_subscriptions where billing_product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.billing_webhook_events where billing_product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.billing_product_catalog where product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.premium_products where product_id = 'theme.celestia'
  ) or exists (
    select 1 from private.development_feature_flags where flag_key = 'celestia_theme_preview'
  ) then
    raise exception 'Legacy Celestia identifiers remain after canonical migration.';
  end if;

  if (select pg_catalog.count(*) from private.premium_products where product_id = 'theme.celestial') <> 1
    or (select pg_catalog.count(*) from private.billing_product_catalog where product_id = 'theme.celestial' and premium_product_id = 'theme.celestial') <> 1
    or (select pg_catalog.count(*) from private.development_feature_flags where flag_key = 'celestial_theme_preview') <> 1 then
    raise exception 'Canonical Celestial catalog verification failed.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Verification after applying (run as an administrative SQL role):
-- select product_id, development_preview_flag_key
-- from private.premium_products
-- where product_id in ('theme.celestia', 'theme.celestial');
-- select product_id, premium_product_id, display_amount_minor, currency, billing_type
-- from private.billing_product_catalog
-- where product_id in ('theme.celestia', 'theme.celestial');
-- select product_id, ownership_source, pg_catalog.count(*)
-- from public.premium_product_ownerships
-- where product_id in ('theme.celestia', 'theme.celestial')
-- group by product_id, ownership_source;
-- select billing_product_id, status, pg_catalog.count(*)
-- from private.billing_purchases
-- where billing_product_id in ('theme.celestia', 'theme.celestial')
-- group by billing_product_id, status
-- order by billing_product_id, status;
-- select theme_key, pg_catalog.count(*)
-- from public.conversation_participants
-- where theme_key in ('celestia', 'celestial')
-- group by theme_key;
-- select flag_key, enabled
-- from private.development_feature_flags
-- where flag_key in ('celestia_theme_preview', 'celestial_theme_preview');
