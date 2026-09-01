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
    raise exception 'Elite avatar borders require the existing avatar-border and centralized premium-access foundations.';
  end if;

  if pg_catalog.to_regclass('private.avatar_border_catalog') is not null then
    raise exception 'The avatar-border entitlement catalog already exists; verify migration history before retrying.';
  end if;

  if exists (
    select 1 from private.development_feature_flags
    where flag_key = any (array['moonveil_border_preview'::text, 'prismara_border_preview'::text, 'solstice_border_preview'::text])
  ) or exists (
    select 1 from private.premium_products
    where product_id = any (array['border.moonveil'::text, 'border.prismara'::text, 'border.solstice'::text])
  ) or exists (
    select 1 from private.billing_product_catalog
    where product_id = any (array['border.moonveil'::text, 'border.prismara'::text, 'border.solstice'::text])
      or premium_product_id = any (array['border.moonveil'::text, 'border.prismara'::text, 'border.solstice'::text])
  ) then
    raise exception 'Moonveil, Prismara, or Solstice is already registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

insert into private.development_feature_flags (flag_key, enabled)
values
  ('moonveil_border_preview', false),
  ('prismara_border_preview', false),
  ('solstice_border_preview', false);

insert into private.premium_products (product_id, development_preview_flag_key)
values
  ('border.moonveil', 'moonveil_border_preview'),
  ('border.prismara', 'prismara_border_preview'),
  ('border.solstice', 'solstice_border_preview');

-- The private bounded mapping is the single authorization source for free
-- and premium avatar-border keys. Browser roles receive no table privileges.
create table private.avatar_border_catalog (
  border_key text primary key,
  premium_product_id text unique references private.premium_products(product_id) on delete restrict,
  constraint avatar_border_catalog_key_check check (
    border_key = pg_catalog.lower(pg_catalog.btrim(border_key))
    and border_key ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

alter table private.avatar_border_catalog enable row level security;
revoke all on table private.avatar_border_catalog from public, anon, authenticated;

insert into private.avatar_border_catalog (border_key, premium_product_id)
values
  ('none', null),
  ('pearl', null),
  ('graphite', null),
  ('azure', null),
  ('emerald', null),
  ('violet', null),
  ('rose', null),
  ('amber', null),
  ('aurelia', 'border.aurelia'),
  ('moonveil', 'border.moonveil'),
  ('prismara', 'border.prismara'),
  ('solstice', 'border.solstice');

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
    'aurelia'::text,
    'moonveil'::text,
    'prismara'::text,
    'solstice'::text
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
  v_premium_product_id text;
  v_saved_border text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated account is unavailable.';
  end if;

  select border_row.premium_product_id
  into v_premium_product_id
  from private.avatar_border_catalog as border_row
  where border_row.border_key = v_border;

  if not found then
    raise exception using errcode = '22023', message = 'The avatar border is invalid.';
  end if;

  if v_premium_product_id is not null
    and not private.can_access_premium_product(v_user_id, v_premium_product_id) then
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
  'Updates only auth.uid() avatar border for an active account. Premium keys are resolved through the private bounded catalog and require centralized product access.';

do $verify$
declare
  v_setter_oid oid := pg_catalog.to_regprocedure('public.set_my_avatar_border(text)');
begin
  if (
    select pg_catalog.count(*)
    from private.premium_products as product_row
    where (product_row.product_id, product_row.development_preview_flag_key) in (
      ('border.moonveil', 'moonveil_border_preview'),
      ('border.prismara', 'prismara_border_preview'),
      ('border.solstice', 'solstice_border_preview')
    )
  ) <> 3 or (
    select pg_catalog.count(*)
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = any (array['moonveil_border_preview'::text, 'prismara_border_preview'::text, 'solstice_border_preview'::text])
      and not feature_flag.enabled
  ) <> 3 then
    raise exception 'Elite avatar-border premium registrations failed verification.';
  end if;

  if (select pg_catalog.count(*) from private.avatar_border_catalog) <> 12 or exists (
    select expected.border_key, expected.premium_product_id
    from (values
      ('none'::text, null::text),
      ('pearl', null),
      ('graphite', null),
      ('azure', null),
      ('emerald', null),
      ('violet', null),
      ('rose', null),
      ('amber', null),
      ('aurelia', 'border.aurelia'),
      ('moonveil', 'border.moonveil'),
      ('prismara', 'border.prismara'),
      ('solstice', 'border.solstice')
    ) as expected(border_key, premium_product_id)
    except
    select actual.border_key, actual.premium_product_id
    from private.avatar_border_catalog as actual
  ) then
    raise exception 'The private avatar-border entitlement catalog failed verification.';
  end if;

  if exists (
    select 1 from private.billing_product_catalog
    where product_id = any (array['border.moonveil'::text, 'border.prismara'::text, 'border.solstice'::text])
      or premium_product_id = any (array['border.moonveil'::text, 'border.prismara'::text, 'border.solstice'::text])
  ) then
    raise exception 'Elite avatar borders must not receive billing catalog rows in this milestone.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_avatar_border_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%aurelia%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%moonveil%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%prismara%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%solstice%'
  ) then
    raise exception 'The profiles avatar-border constraint failed verification.';
  end if;

  if v_setter_oid is null or not exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid = v_setter_oid
      and procedure_row.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(coalesce(procedure_row.proconfig, '{}'::text[])) as function_setting(setting)
        where pg_catalog.btrim(pg_catalog.split_part(function_setting.setting, '=', 1)) = 'search_path'
          and pg_catalog.btrim(
            pg_catalog.split_part(function_setting.setting, '=', 2),
            E' \t"'
          ) = ''
      )
  ) then
    raise exception 'The secure avatar-border setter failed verification.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('anon', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('public', v_setter_oid, 'execute') then
    raise exception 'The avatar-border setter execute privileges failed verification.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
