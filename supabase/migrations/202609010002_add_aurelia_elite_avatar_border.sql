begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.get_my_premium_access()') is null
    or pg_catalog.to_regprocedure('public.set_my_avatar_border(text)') is null then
    raise exception 'Aurelia requires the avatar-border and centralized premium-access foundations.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'aurelia_border_preview'
  ) or exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'border.aurelia'
  ) or exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'border.aurelia'
      or billing_product.premium_product_id = 'border.aurelia'
  ) then
    raise exception 'Aurelia is already registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Development preview is disabled by default and remains separate from
-- permanent ownership, Gold status, Elite subscriptions, and billing state.
insert into private.development_feature_flags (flag_key, enabled)
values ('aurelia_border_preview', false);

-- Register the entitlement identity without creating a billing product. The
-- centralized resolver now supports active Elite, permanent ownership, and
-- the existing dual-gated development-preview architecture for Aurelia.
insert into private.premium_products (product_id, development_preview_flag_key)
values ('border.aurelia', 'aurelia_border_preview');

alter table public.profiles
  drop constraint profiles_avatar_border_check;

alter table public.profiles
  add constraint profiles_avatar_border_check
  check (avatar_border = any (array[
    'none'::text,
    'pearl'::text,
    'graphite'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text,
    'aurelia'::text
  ]));

create or replace function public.set_my_avatar_border(candidate_border text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_border text := pg_catalog.lower(pg_catalog.btrim(candidate_border));
  v_saved_border text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated account is unavailable.';
  end if;

  if v_border is null or v_border <> all (array[
    'none'::text,
    'pearl'::text,
    'graphite'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text,
    'aurelia'::text
  ]) then
    raise exception using errcode = '22023', message = 'The avatar border is invalid.';
  end if;

  if v_border = 'aurelia'
    and not private.can_access_premium_product(v_user_id, 'border.aurelia') then
    raise exception using errcode = '42501', message = 'This Elite avatar border is not available for this account.';
  end if;

  update public.profiles as profile_row
  set avatar_border = v_border
  where profile_row.id = v_user_id
  returning profile_row.avatar_border into v_saved_border;

  if v_saved_border is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_saved_border;
end;
$function$;

revoke all on function public.set_my_avatar_border(text) from public, anon, authenticated;
grant execute on function public.set_my_avatar_border(text) to authenticated;

comment on function public.set_my_avatar_border(text) is
  'Updates only auth.uid() avatar border for an active account. Premium borders require centralized product access.';

do $verify$
begin
  if (select pg_catalog.count(*) from private.premium_products where product_id = 'border.aurelia' and development_preview_flag_key = 'aurelia_border_preview') <> 1
    or (select pg_catalog.count(*) from private.development_feature_flags where flag_key = 'aurelia_border_preview' and not enabled) <> 1 then
    raise exception 'Aurelia premium registration verification failed.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'border.aurelia'
      or billing_product.premium_product_id = 'border.aurelia'
  ) then
    raise exception 'Aurelia must not receive a billing catalog row before provider configuration.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_avatar_border_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%aurelia%'
  ) then
    raise exception 'Aurelia avatar-border constraint verification failed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
