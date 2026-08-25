begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.conversations') is null then
    raise exception 'Premium entitlements require the current account and personal conversation theme foundation.';
  end if;
  if pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.set_updated_at()') is null then
    raise exception 'Premium entitlements require the current private security helpers.';
  end if;
  if pg_catalog.to_regprocedure('public.set_personal_conversation_theme(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.list_my_personal_conversation_themes()') is null then
    raise exception 'Premium entitlements require migrations 202608250001 through 202608250004.';
  end if;
  if not exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'obsidian_theme_preview'
  ) or not exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'celestia_theme_preview'
  ) then
    raise exception 'Premium entitlements require both existing Elite theme preview flags.';
  end if;
end;
$$;

-- The private product catalog defines stable authorization identities only.
-- Pricing, provider IDs, checkout metadata, and purchase state do not belong in
-- this foundation.
create table private.premium_products (
  product_id text primary key,
  development_preview_flag_key text unique references private.development_feature_flags(flag_key) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint premium_products_id_check check (
    product_id = pg_catalog.btrim(product_id)
    and pg_catalog.char_length(product_id) between 3 and 100
    and product_id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_-]*)+$'
  )
);

alter table private.premium_products enable row level security;
revoke all on table private.premium_products from public, anon, authenticated;

insert into private.premium_products (product_id, development_preview_flag_key)
values
  ('theme.obsidian', 'obsidian_theme_preview'),
  ('theme.celestia', 'celestia_theme_preview');

create table public.account_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'normal',
  elite_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint account_plans_state_check check (
    (plan = 'normal' and elite_expires_at is null)
    or (plan = 'elite' and elite_expires_at is not null)
  )
);

comment on table public.account_plans is
  'Authoritative account plan configuration. Elite is effective only while elite_expires_at is in the future; expired rows resolve to Normal.';
comment on column public.account_plans.elite_expires_at is
  'Required for Elite rows. This foundation deliberately has no non-expiring or fabricated billing state.';

create trigger account_plans_set_updated_at
before update on public.account_plans
for each row execute function private.set_updated_at();

alter table public.account_plans enable row level security;
revoke all on table public.account_plans from public, anon, authenticated;

create table public.premium_product_ownerships (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references private.premium_products(product_id) on delete restrict,
  acquired_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, product_id)
);

create index premium_product_ownerships_product_idx
  on public.premium_product_ownerships(product_id, user_id);

comment on table public.premium_product_ownerships is
  'Permanent premium-product ownership. Ownership is independent from account plan identity and cannot be granted by browser roles.';

alter table public.premium_product_ownerships enable row level security;
revoke all on table public.premium_product_ownerships from public, anon, authenticated;

-- Existing users receive the explicit default row. Missing rows still resolve
-- closed to Normal in every authorization function.
insert into public.account_plans (user_id, plan, elite_expires_at)
select account_row.id, 'normal', null::timestamptz
from auth.users as account_row
on conflict (user_id) do nothing;

create function private.initialize_account_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_plans (user_id, plan, elite_expires_at)
  values (new.id, 'normal', null::timestamptz)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_account_plan() from public, anon, authenticated;

create trigger auth_users_initialize_account_plan
after insert on auth.users
for each row execute function private.initialize_account_plan();

-- This is the single server-side premium authorization resolver. Browser roles
-- cannot execute it; caller-facing RPCs must pass auth.uid() after validating
-- their own operation.
create function private.can_access_premium_product(
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
          or exists (
            select 1
            from public.account_plans as plan_row
            where plan_row.user_id = target_user_id
              and plan_row.plan = 'elite'
              and plan_row.elite_expires_at > pg_catalog.now()
          )
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

-- Caller-derived, bounded premium state for frontend presentation. It exposes
-- no other account's ownership or internal product metadata.
create function public.get_my_premium_access()
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
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'This account is unavailable.';
  end if;

  return query
  select
    case when coalesce(plan_state.elite_active, false) then 'elite' else 'normal' end,
    coalesce(plan_state.elite_active, false),
    plan_state.elite_expires_at,
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
    ), '{}'::text[])
  from (
    select
      plan_row.elite_expires_at,
      plan_row.plan = 'elite'
        and plan_row.elite_expires_at > pg_catalog.now() as elite_active
    from public.account_plans as plan_row
    where plan_row.user_id = v_actor_id

    union all

    select null::timestamptz, false
    where not exists (
      select 1
      from public.account_plans as missing_plan_row
      where missing_plan_row.user_id = v_actor_id
    )
  ) as plan_state
  limit 1;
end;
$$;

revoke all on function public.get_my_premium_access() from public, anon, authenticated;
grant execute on function public.get_my_premium_access() to authenticated;

comment on function public.get_my_premium_access() is
  'Returns the active caller account plan, private permanent product IDs, and enabled development-preview products. Expired or missing plans resolve to Normal.';

-- Theme IDs continue to be participant-local preferences. Premium themes map
-- to stable product IDs by the controlled theme.<theme_key> convention and use
-- the centralized resolver.
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
    'celestia'
  ) then
    raise exception using errcode = '22023', message = 'That conversation theme is unavailable.';
  end if;

  -- Only the permanent free catalog bypasses premium authorization. Every
  -- other allowed theme fails closed if its stable product is missing or the
  -- caller lacks effective access.
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
      when participant_row.theme_key not in (
        'default',
        'midnight',
        'ocean',
        'lavender',
        'emerald',
        'rose',
        'sunset'
      ) and not private.can_access_premium_product(auth.uid(), 'theme.' || participant_row.theme_key)
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
  'Lists effective caller-local conversation themes while preserving stored premium preferences that are temporarily unauthorized.';

notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select * from public.get_my_premium_access();
-- select has_table_privilege('authenticated', 'public.account_plans', 'select,insert,update,delete') as member_has_plan_access,
--        has_table_privilege('authenticated', 'public.premium_product_ownerships', 'select,insert,update,delete') as member_has_ownership_access;
-- select has_function_privilege('authenticated', 'private.can_access_premium_product(uuid,text)', 'execute') as member_can_call_private_resolver,
--        has_function_privilege('authenticated', 'public.get_my_premium_access()', 'execute') as member_can_read_own_access;
-- select conname, pg_catalog.pg_get_constraintdef(oid)
-- from pg_catalog.pg_constraint
-- where conrelid in ('public.account_plans'::regclass, 'public.premium_product_ownerships'::regclass)
-- order by conrelid::regclass::text, conname;
