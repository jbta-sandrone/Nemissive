begin;

do $$
begin
  if pg_catalog.to_regclass('public.account_plans') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.set_updated_at()') is null then
    raise exception 'Lemon Squeezy billing requires migration 202608250005 and the current account security foundation.';
  end if;
end;
$$;

-- Permanent ownership provenance prevents a refund from revoking ownership
-- created independently by trusted administrative tooling. Administrative
-- Elite grants remain in public.account_plans; billing Elite grants remain in
-- private.billing_subscriptions and are resolved together without overwrites.
alter table public.premium_product_ownerships
  add column ownership_source text not null default 'administrative';

alter table public.premium_product_ownerships
  add constraint premium_product_ownerships_source_check
  check (ownership_source in ('administrative'::text, 'billing'::text));

-- This private catalog is entitlement identity and presentation-price metadata.
-- Lemon Squeezy variant IDs remain server environment configuration so no
-- placeholder provider IDs are committed or exposed through the Data API.
create table private.billing_product_catalog (
  product_id text primary key,
  billing_type text not null,
  premium_product_id text references private.premium_products(product_id) on delete restrict,
  account_plan text,
  display_amount_minor integer not null,
  currency text not null,
  billing_interval text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint billing_product_catalog_type_check check (billing_type in ('one_time'::text, 'subscription'::text)),
  constraint billing_product_catalog_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_product_catalog_amount_check check (display_amount_minor > 0),
  constraint billing_product_catalog_entitlement_check check (
    (billing_type = 'one_time'::text
      and premium_product_id is not null
      and account_plan is null
      and billing_interval is null)
    or
    (billing_type = 'subscription'::text
      and premium_product_id is null
      and account_plan = 'elite'::text
      and billing_interval = 'month'::text)
  )
);

alter table private.billing_product_catalog enable row level security;
revoke all on table private.billing_product_catalog from public, anon, authenticated;

insert into private.billing_product_catalog (
  product_id,
  billing_type,
  premium_product_id,
  account_plan,
  display_amount_minor,
  currency,
  billing_interval
)
values
  ('theme.obsidian', 'one_time', 'theme.obsidian', null, 29900, 'PHP', null),
  ('theme.celestia', 'one_time', 'theme.celestia', null, 29900, 'PHP', null),
  ('elite.monthly', 'subscription', null, 'elite', 19900, 'PHP', 'month');

create table private.billing_purchases (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null default 'lemonsqueezy',
  provider_order_id text not null,
  provider_store_id bigint not null,
  provider_variant_id bigint not null,
  user_id uuid references auth.users(id) on delete set null,
  billing_product_id text not null references private.billing_product_catalog(product_id) on delete restrict,
  status text not null,
  amount integer not null,
  refunded_amount integer not null default 0,
  currency text not null,
  test_mode boolean not null,
  purchased_at timestamptz not null,
  refunded_at timestamptz,
  provider_updated_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_purchases_provider_check check (provider = 'lemonsqueezy'::text),
  constraint billing_purchases_order_id_check check (provider_order_id = pg_catalog.btrim(provider_order_id) and pg_catalog.char_length(provider_order_id) between 1 and 100),
  constraint billing_purchases_status_check check (status in ('pending'::text, 'paid'::text, 'failed'::text, 'partial_refund'::text, 'refunded'::text, 'fraudulent'::text)),
  constraint billing_purchases_amount_check check (amount >= 0 and refunded_amount >= 0 and refunded_amount <= amount),
  constraint billing_purchases_currency_check check (currency ~ '^[A-Z]{3}$'),
  unique (provider, provider_order_id)
);

create index billing_purchases_user_product_idx
  on private.billing_purchases(user_id, billing_product_id, status)
  where user_id is not null;

create trigger billing_purchases_set_updated_at
before update on private.billing_purchases
for each row execute function private.set_updated_at();

alter table private.billing_purchases enable row level security;
revoke all on table private.billing_purchases from public, anon, authenticated;

create table private.billing_subscriptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null default 'lemonsqueezy',
  provider_subscription_id text not null,
  provider_customer_id text not null,
  provider_order_id text,
  provider_store_id bigint not null,
  provider_variant_id bigint not null,
  user_id uuid references auth.users(id) on delete set null,
  billing_product_id text not null references private.billing_product_catalog(product_id) on delete restrict,
  status text not null,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  test_mode boolean not null,
  provider_created_at timestamptz not null,
  provider_updated_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_subscriptions_provider_check check (provider = 'lemonsqueezy'::text),
  constraint billing_subscriptions_id_check check (provider_subscription_id = pg_catalog.btrim(provider_subscription_id) and pg_catalog.char_length(provider_subscription_id) between 1 and 100),
  constraint billing_subscriptions_customer_check check (provider_customer_id = pg_catalog.btrim(provider_customer_id) and pg_catalog.char_length(provider_customer_id) between 1 and 100),
  constraint billing_subscriptions_status_check check (status in ('on_trial'::text, 'active'::text, 'paused'::text, 'past_due'::text, 'unpaid'::text, 'cancelled'::text, 'expired'::text)),
  unique (provider, provider_subscription_id)
);

create index billing_subscriptions_user_status_idx
  on private.billing_subscriptions(user_id, status, renews_at, ends_at)
  where user_id is not null;

create trigger billing_subscriptions_set_updated_at
before update on private.billing_subscriptions
for each row execute function private.set_updated_at();

alter table private.billing_subscriptions enable row level security;
revoke all on table private.billing_subscriptions from public, anon, authenticated;

-- Lemon Squeezy retries reuse the same signed body but do not include a
-- provider event ID. provider_event_key is therefore the Edge Function's
-- SHA-256 fingerprint of the exact verified raw request body.
create table private.billing_webhook_events (
  provider text not null default 'lemonsqueezy',
  provider_event_key text not null,
  event_name text not null,
  resource_type text not null,
  resource_id text not null,
  billing_product_id text references private.billing_product_catalog(product_id) on delete restrict,
  status text not null default 'processing',
  result_code text,
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  processed_at timestamptz,
  primary key (provider, provider_event_key),
  constraint billing_webhook_events_provider_check check (provider = 'lemonsqueezy'::text),
  constraint billing_webhook_events_key_check check (provider_event_key ~ '^[0-9a-f]{64}$'),
  constraint billing_webhook_events_name_check check (event_name = pg_catalog.btrim(event_name) and pg_catalog.char_length(event_name) between 1 and 100),
  constraint billing_webhook_events_resource_check check (resource_type in ('orders'::text, 'subscriptions'::text) and resource_id = pg_catalog.btrim(resource_id) and pg_catalog.char_length(resource_id) between 1 and 100),
  constraint billing_webhook_events_status_check check (status in ('processing'::text, 'processed'::text, 'ignored'::text))
);

create index billing_webhook_events_received_idx
  on private.billing_webhook_events(received_at desc);

alter table private.billing_webhook_events enable row level security;
revoke all on table private.billing_webhook_events from public, anon, authenticated;

create function private.billing_subscription_access_expires_at(
  subscription_status text,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case subscription_status
    when 'on_trial'::text then trial_ends_at
    when 'active'::text then renews_at
    when 'past_due'::text then renews_at
    when 'cancelled'::text then ends_at
    else null::timestamptz
  end;
$$;

revoke all on function private.billing_subscription_access_expires_at(text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

create function private.sync_billing_product_ownership(
  target_user_id uuid,
  target_billing_product_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_premium_product_id text;
begin
  if target_user_id is null then
    return;
  end if;

  select catalog_row.premium_product_id
  into v_premium_product_id
  from private.billing_product_catalog as catalog_row
  where catalog_row.product_id = target_billing_product_id
    and catalog_row.billing_type = 'one_time'::text;

  if v_premium_product_id is null then
    raise exception using errcode = '22023', message = 'The billing product cannot grant permanent ownership.';
  end if;

  if exists (
    select 1
    from private.billing_purchases as purchase_row
    where purchase_row.user_id = target_user_id
      and purchase_row.billing_product_id = target_billing_product_id
      and purchase_row.status in ('paid'::text, 'partial_refund'::text)
  ) then
    insert into public.premium_product_ownerships (user_id, product_id, acquired_at, ownership_source)
    values (target_user_id, v_premium_product_id, pg_catalog.clock_timestamp(), 'billing')
    on conflict (user_id, product_id) do nothing;
  else
    delete from public.premium_product_ownerships as ownership_row
    where ownership_row.user_id = target_user_id
      and ownership_row.product_id = v_premium_product_id
      and ownership_row.ownership_source = 'billing'::text;
  end if;
end;
$$;

revoke all on function private.sync_billing_product_ownership(uuid, text) from public, anon, authenticated;

-- Administrative and billing Elite grants are independent authoritative
-- sources. This helper is the single effective-expiry calculation used by
-- checkout authorization, premium-product authorization, and account state.
-- Expiring or deleting one source cannot mutate the other source.
create function private.effective_elite_expires_at(target_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.max(entitlement_source.expires_at)
  from (
    select plan_row.elite_expires_at as expires_at
    from public.account_plans as plan_row
    where plan_row.user_id = target_user_id
      and plan_row.plan = 'elite'::text

    union all

    select private.billing_subscription_access_expires_at(
      subscription_row.status,
      subscription_row.renews_at,
      subscription_row.ends_at,
      subscription_row.trial_ends_at
    ) as expires_at
    from private.billing_subscriptions as subscription_row
    where subscription_row.user_id = target_user_id
      and subscription_row.billing_product_id = 'elite.monthly'::text
  ) as entitlement_source
  where target_user_id is not null
    and entitlement_source.expires_at > pg_catalog.now();
$$;

revoke all on function private.effective_elite_expires_at(uuid) from public, anon, authenticated;

-- Replace the premium foundation's resolver so all server-authoritative
-- premium checks use the same effective Elite definition.
create or replace function private.can_access_premium_product(
  target_user_id uuid,
  target_product_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id is not null
    and target_product_id is not null
    and private.is_active_account(target_user_id)
    and exists (
      select 1
      from private.premium_products as product_row
      where product_row.product_id = target_product_id
        and (
          exists (
            select 1
            from public.premium_product_ownerships as ownership_row
            where ownership_row.user_id = target_user_id
              and ownership_row.product_id = product_row.product_id
          )
          or private.effective_elite_expires_at(target_user_id) is not null
          or (
            product_row.development_preview_flag_key is not null
            and exists (
              select 1
              from private.development_feature_flags as feature_flag
              where feature_flag.flag_key = product_row.development_preview_flag_key
                and feature_flag.enabled
            )
          )
        )
    );
$$;

revoke all on function private.can_access_premium_product(uuid, text) from public, anon, authenticated;

-- Replace the caller-owned premium-state reader so the UI's plan badge and
-- product access presentation use the same effective Elite calculation.
create or replace function public.get_my_premium_access()
returns table (
  account_plan text,
  elite_active boolean,
  elite_expires_at timestamptz,
  owned_product_ids text[],
  preview_product_ids text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_effective_elite_expires_at timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'This account is unavailable.';
  end if;

  v_effective_elite_expires_at := private.effective_elite_expires_at(v_actor_id);

  return query
  select
    case when v_effective_elite_expires_at is not null then 'elite'::text else 'normal'::text end,
    v_effective_elite_expires_at is not null,
    v_effective_elite_expires_at,
    coalesce((
      select pg_catalog.array_agg(ownership_row.product_id order by ownership_row.product_id)
      from public.premium_product_ownerships as ownership_row
      where ownership_row.user_id = v_actor_id
    ), '{}'::text[]),
    coalesce((
      select pg_catalog.array_agg(product_row.product_id order by product_row.product_id)
      from private.premium_products as product_row
      join private.development_feature_flags as feature_flag
        on feature_flag.flag_key = product_row.development_preview_flag_key
       and feature_flag.enabled
    ), '{}'::text[]);
end;
$$;

revoke all on function public.get_my_premium_access() from public, anon, authenticated;
grant execute on function public.get_my_premium_access() to authenticated;

comment on function public.get_my_premium_access() is
  'Returns the caller effective account plan across independent administrative and billing Elite sources, private permanent product IDs, and enabled development-preview products.';

-- Called only after the authenticated checkout Edge Function derives the user.
-- It independently rejects redundant purchases and duplicate Elite checkouts.
create function public.authorize_billing_checkout(
  target_account_id uuid,
  target_product_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog private.billing_product_catalog%rowtype;
begin
  if target_account_id is null or target_product_id is null then
    raise exception using errcode = '22023', message = 'An account and billing product are required.';
  end if;
  if not private.is_active_account(target_account_id) then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'account_unavailable');
  end if;

  select catalog_row.*
  into v_catalog
  from private.billing_product_catalog as catalog_row
  where catalog_row.product_id = target_product_id;

  if not found then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'product_unavailable');
  end if;

  if v_catalog.billing_type = 'one_time'::text then
    if exists (
      select 1
      from public.premium_product_ownerships as ownership_row
      where ownership_row.user_id = target_account_id
        and ownership_row.product_id = v_catalog.premium_product_id
    ) then
      return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'already_owned');
    end if;
    if private.effective_elite_expires_at(target_account_id) is not null then
      return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'elite_active');
    end if;
  elsif private.effective_elite_expires_at(target_account_id) is not null then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'elite_active');
  end if;

  return pg_catalog.jsonb_build_object('allowed', true, 'reason', null);
end;
$$;

revoke all on function public.authorize_billing_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_billing_checkout(uuid, text) to service_role;

-- Signature validation, store/test-mode checks, and variant-to-product mapping
-- happen in the webhook Edge Function. This service-role-only RPC provides the
-- atomic database boundary, durable retry guard, stale-resource guard, and
-- entitlement synchronization.
create function public.process_lemonsqueezy_webhook(
  target_event_key text,
  target_event_name text,
  target_resource_type text,
  target_resource_id text,
  target_store_id bigint,
  target_variant_id bigint,
  target_test_mode boolean,
  target_user_id uuid,
  target_local_product_id text,
  target_status text,
  target_amount integer,
  target_currency text,
  target_refunded_amount integer,
  target_customer_id text,
  target_order_id text,
  target_renews_at timestamptz,
  target_ends_at timestamptz,
  target_trial_ends_at timestamptz,
  target_provider_created_at timestamptz,
  target_provider_updated_at timestamptz,
  target_refunded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog private.billing_product_catalog%rowtype;
  v_existing_user_id uuid;
  v_existing_product_id text;
  v_existing_updated_at timestamptz;
  v_effective_user_id uuid;
begin
  if target_event_key is null or target_event_key !~ '^[0-9a-f]{64}$'
    or target_event_name is null
    or target_resource_type is null
    or target_resource_type not in ('orders'::text, 'subscriptions'::text)
    or target_resource_id is null
    or target_store_id is null
    or target_variant_id is null
    or target_test_mode is null
    or target_local_product_id is null
    or target_status is null
    or target_provider_created_at is null
    or target_provider_updated_at is null then
    raise exception using errcode = '22023', message = 'The normalized billing event is incomplete.';
  end if;

  select catalog_row.*
  into v_catalog
  from private.billing_product_catalog as catalog_row
  where catalog_row.product_id = target_local_product_id;

  if not found then
    raise exception using errcode = '22023', message = 'The billing product is unavailable.';
  end if;

  insert into private.billing_webhook_events (
    provider_event_key,
    event_name,
    resource_type,
    resource_id,
    billing_product_id
  )
  values (
    target_event_key,
    target_event_name,
    target_resource_type,
    target_resource_id,
    target_local_product_id
  )
  on conflict (provider, provider_event_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('processed', true, 'duplicate', true, 'result', 'duplicate');
  end if;

  if target_resource_type = 'orders'::text then
    if target_event_name not in ('order_created'::text, 'order_refunded'::text)
      or v_catalog.billing_type <> 'one_time'::text
      or target_status not in ('pending'::text, 'paid'::text, 'failed'::text, 'partial_refund'::text, 'refunded'::text, 'fraudulent'::text)
      or target_amount is null
      or target_refunded_amount is null
      or target_currency is null
      or target_currency !~ '^[A-Z]{3}$'
      or target_amount < 0
      or target_refunded_amount < 0
      or target_refunded_amount > target_amount then
      update private.billing_webhook_events
      set status = 'ignored'::text, result_code = 'invalid_order_state'::text, processed_at = pg_catalog.clock_timestamp()
      where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
      return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'invalid_order_state');
    end if;

    select purchase_row.user_id, purchase_row.billing_product_id, purchase_row.provider_updated_at
    into v_existing_user_id, v_existing_product_id, v_existing_updated_at
    from private.billing_purchases as purchase_row
    where purchase_row.provider = 'lemonsqueezy'::text
      and purchase_row.provider_order_id = target_resource_id
    for update;

    if found then
      if v_existing_product_id <> target_local_product_id
        or (v_existing_user_id is not null and target_user_id is not null and v_existing_user_id <> target_user_id) then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'resource_mapping_conflict'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'resource_mapping_conflict');
      end if;
      if target_provider_updated_at < v_existing_updated_at then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'stale_resource'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'stale_resource');
      end if;
      v_effective_user_id := coalesce(v_existing_user_id, target_user_id);
      update private.billing_purchases as purchase_row
      set provider_store_id = target_store_id,
          provider_variant_id = target_variant_id,
          user_id = case
            when v_existing_user_id is not null then v_existing_user_id
            when target_user_id is not null and exists (select 1 from auth.users as account_row where account_row.id = target_user_id) then target_user_id
            else null::uuid
          end,
          status = target_status,
          amount = target_amount,
          refunded_amount = target_refunded_amount,
          currency = target_currency,
          test_mode = target_test_mode,
          refunded_at = target_refunded_at,
          provider_updated_at = target_provider_updated_at
      where purchase_row.provider = 'lemonsqueezy'::text
        and purchase_row.provider_order_id = target_resource_id;
    else
      if target_user_id is null or not private.is_active_account(target_user_id) then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'target_unavailable'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'target_unavailable');
      end if;
      v_effective_user_id := target_user_id;
      insert into private.billing_purchases (
        provider_order_id,
        provider_store_id,
        provider_variant_id,
        user_id,
        billing_product_id,
        status,
        amount,
        refunded_amount,
        currency,
        test_mode,
        purchased_at,
        refunded_at,
        provider_updated_at
      )
      values (
        target_resource_id,
        target_store_id,
        target_variant_id,
        target_user_id,
        target_local_product_id,
        target_status,
        target_amount,
        target_refunded_amount,
        target_currency,
        target_test_mode,
        target_provider_created_at,
        target_refunded_at,
        target_provider_updated_at
      );
    end if;

    perform private.sync_billing_product_ownership(v_effective_user_id, target_local_product_id);
  else
    if target_event_name not in (
      'subscription_created'::text,
      'subscription_updated'::text,
      'subscription_cancelled'::text,
      'subscription_resumed'::text,
      'subscription_expired'::text
    )
      or v_catalog.billing_type <> 'subscription'::text
      or target_status not in ('on_trial'::text, 'active'::text, 'paused'::text, 'past_due'::text, 'unpaid'::text, 'cancelled'::text, 'expired'::text)
      or target_customer_id is null then
      update private.billing_webhook_events
      set status = 'ignored'::text, result_code = 'invalid_subscription_state'::text, processed_at = pg_catalog.clock_timestamp()
      where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
      return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'invalid_subscription_state');
    end if;

    select subscription_row.user_id, subscription_row.billing_product_id, subscription_row.provider_updated_at
    into v_existing_user_id, v_existing_product_id, v_existing_updated_at
    from private.billing_subscriptions as subscription_row
    where subscription_row.provider = 'lemonsqueezy'::text
      and subscription_row.provider_subscription_id = target_resource_id
    for update;

    if found then
      if v_existing_product_id <> target_local_product_id
        or (v_existing_user_id is not null and target_user_id is not null and v_existing_user_id <> target_user_id) then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'resource_mapping_conflict'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'resource_mapping_conflict');
      end if;
      if target_provider_updated_at < v_existing_updated_at then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'stale_resource'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'stale_resource');
      end if;
      v_effective_user_id := coalesce(v_existing_user_id, target_user_id);
      update private.billing_subscriptions as subscription_row
      set provider_customer_id = target_customer_id,
          provider_order_id = target_order_id,
          provider_store_id = target_store_id,
          provider_variant_id = target_variant_id,
          user_id = case
            when v_existing_user_id is not null then v_existing_user_id
            when target_user_id is not null and exists (select 1 from auth.users as account_row where account_row.id = target_user_id) then target_user_id
            else null::uuid
          end,
          status = target_status,
          renews_at = target_renews_at,
          ends_at = target_ends_at,
          trial_ends_at = target_trial_ends_at,
          test_mode = target_test_mode,
          provider_created_at = target_provider_created_at,
          provider_updated_at = target_provider_updated_at
      where subscription_row.provider = 'lemonsqueezy'::text
        and subscription_row.provider_subscription_id = target_resource_id;
    else
      if target_user_id is null or not private.is_active_account(target_user_id) then
        update private.billing_webhook_events
        set status = 'ignored'::text, result_code = 'target_unavailable'::text, processed_at = pg_catalog.clock_timestamp()
        where provider = 'lemonsqueezy'::text and provider_event_key = target_event_key;
        return pg_catalog.jsonb_build_object('processed', false, 'duplicate', false, 'result', 'target_unavailable');
      end if;
      v_effective_user_id := target_user_id;
      insert into private.billing_subscriptions (
        provider_subscription_id,
        provider_customer_id,
        provider_order_id,
        provider_store_id,
        provider_variant_id,
        user_id,
        billing_product_id,
        status,
        renews_at,
        ends_at,
        trial_ends_at,
        test_mode,
        provider_created_at,
        provider_updated_at
      )
      values (
        target_resource_id,
        target_customer_id,
        target_order_id,
        target_store_id,
        target_variant_id,
        target_user_id,
        target_local_product_id,
        target_status,
        target_renews_at,
        target_ends_at,
        target_trial_ends_at,
        target_test_mode,
        target_provider_created_at,
        target_provider_updated_at
      );
    end if;

  end if;

  update private.billing_webhook_events
  set status = 'processed'::text,
      result_code = 'entitlement_synchronized'::text,
      processed_at = pg_catalog.clock_timestamp()
  where provider = 'lemonsqueezy'::text
    and provider_event_key = target_event_key;

  return pg_catalog.jsonb_build_object('processed', true, 'duplicate', false, 'result', 'entitlement_synchronized');
end;
$$;

revoke all on function public.process_lemonsqueezy_webhook(text, text, text, text, bigint, bigint, boolean, uuid, text, text, integer, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.process_lemonsqueezy_webhook(text, text, text, text, bigint, bigint, boolean, uuid, text, text, integer, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- Account deletion uses this bounded manifest to cancel future provider
-- renewals before the Auth user is removed. Billing rows then retain only
-- provider audit IDs and are automatically de-linked by ON DELETE SET NULL.
create function public.list_account_billing_subscriptions_for_deletion(target_account_id uuid)
returns table (provider_subscription_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'An account ID is required.';
  end if;

  return query
  select subscription_row.provider_subscription_id
  from private.billing_subscriptions as subscription_row
  where subscription_row.user_id = target_account_id
    and subscription_row.provider = 'lemonsqueezy'::text
    and subscription_row.status not in ('cancelled'::text, 'expired'::text)
  order by subscription_row.provider_subscription_id;
end;
$$;

revoke all on function public.list_account_billing_subscriptions_for_deletion(uuid) from public, anon, authenticated;
grant execute on function public.list_account_billing_subscriptions_for_deletion(uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- Verification after applying (run as an administrative SQL role):
-- select product_id, billing_type, premium_product_id, account_plan,
--        display_amount_minor, currency, billing_interval
-- from private.billing_product_catalog order by product_id;
-- select relname, relrowsecurity
-- from pg_catalog.pg_class
-- where oid in (
--   'private.billing_product_catalog'::regclass,
--   'private.billing_purchases'::regclass,
--   'private.billing_subscriptions'::regclass,
--   'private.billing_webhook_events'::regclass
-- );
-- select has_table_privilege('authenticated', 'private.billing_purchases', 'select,insert,update,delete') as member_purchase_access,
--        has_table_privilege('authenticated', 'private.billing_subscriptions', 'select,insert,update,delete') as member_subscription_access,
--        has_table_privilege('authenticated', 'private.billing_webhook_events', 'select,insert,update,delete') as member_event_access;
-- select has_function_privilege('authenticated', 'public.authorize_billing_checkout(uuid,text)', 'execute') as member_checkout_authorizer,
--        has_function_privilege('authenticated', 'public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)', 'execute') as member_webhook_processor,
--        has_function_privilege('service_role', 'public.authorize_billing_checkout(uuid,text)', 'execute') as service_checkout_authorizer,
--        has_function_privilege('service_role', 'public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)', 'execute') as service_webhook_processor;
-- with target as (select 'USER_ID_HERE'::uuid as user_id)
-- select
--   (select plan_row.elite_expires_at
--    from public.account_plans as plan_row, target
--    where plan_row.user_id = target.user_id and plan_row.plan = 'elite') as administrative_expires_at,
--   (select pg_catalog.max(private.billing_subscription_access_expires_at(
--      subscription_row.status,
--      subscription_row.renews_at,
--      subscription_row.ends_at,
--      subscription_row.trial_ends_at
--    ))
--    from private.billing_subscriptions as subscription_row, target
--    where subscription_row.user_id = target.user_id
--      and subscription_row.billing_product_id = 'elite.monthly') as billing_expires_at,
--   private.effective_elite_expires_at(target.user_id) as effective_expires_at
-- from target;
