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
    or pg_catalog.to_regprocedure('public.set_my_profile_banner(text)') is null then
    raise exception 'Astralis requires the deployed free Profile Theme and centralized premium-access foundations.';
  end if;

  if pg_catalog.to_regclass('private.profile_theme_catalog') is not null then
    raise exception 'A private Profile Theme catalog already exists; verify migration history before retrying.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'private.premium_products'::regclass
      and constraint_row.conname = 'premium_products_id_check'
      and constraint_row.contype = 'c'
  ) then
    raise exception 'The bounded premium-product identity constraint is unavailable.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.profiles'::regclass
      and attribute_row.attname = 'profile_banner'
      and attribute_row.atttypid = 'text'::regtype
      and attribute_row.attnotnull
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
      and exists (
        select 1
        from pg_catalog.pg_attrdef as default_row
        where default_row.adrelid = attribute_row.attrelid
          and default_row.adnum = attribute_row.attnum
          and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''none''::text'
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_profile_banner_check'
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%none%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%azure%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%emerald%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%violet%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%rose%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%amber%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%ocean%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%twilight%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%astralis%'
  ) or exists (
    select 1
    from public.profiles as profile_row
    where profile_row.profile_banner <> all (array[
      'none'::text,
      'azure'::text,
      'emerald'::text,
      'violet'::text,
      'rose'::text,
      'amber'::text,
      'ocean'::text,
      'twilight'::text
    ])
  ) then
    raise exception 'The deployed free Profile Theme column or bounded constraint is not in the expected state.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.profiles'::regclass
      and relation_row.relrowsecurity
  ) or not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
      and 'profile_banner'::name = any (publication_table.attnames)
  ) then
    raise exception 'The deployed Profile Theme RLS or Realtime foundation is incomplete.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'astralis_profile_theme_preview'
  ) or exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'profile-theme.astralis'
  ) or exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'profile-theme.astralis'
      or billing_product.premium_product_id = 'profile-theme.astralis'
  ) then
    raise exception 'Astralis is already partially registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Permit the canonical profile-theme namespace while keeping every premium
-- product identity normalized and structurally bounded.
alter table private.premium_products
  drop constraint premium_products_id_check;

alter table private.premium_products
  add constraint premium_products_id_check check (
    product_id = pg_catalog.btrim(product_id)
    and pg_catalog.char_length(product_id) between 3 and 100
    and product_id ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
  );

-- Development preview remains disabled by default and never creates purchase,
-- ownership, Gold, Elite, or billing state.
insert into private.development_feature_flags (flag_key, enabled)
values ('astralis_profile_theme_preview', false);

-- Register only the local premium authorization identity. Lemon Squeezy and
-- the private billing catalog are deliberately out of scope for this milestone.
insert into private.premium_products (product_id, development_preview_flag_key)
values ('profile-theme.astralis', 'astralis_profile_theme_preview');

-- The private bounded mapping is the single authorization source for free and
-- premium Profile Theme keys. Browser roles receive no table privileges.
create table private.profile_theme_catalog (
  theme_key text primary key,
  premium_product_id text unique references private.premium_products(product_id) on delete restrict,
  constraint profile_theme_catalog_key_check check (
    theme_key = pg_catalog.lower(pg_catalog.btrim(theme_key))
    and theme_key ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

alter table private.profile_theme_catalog enable row level security;
revoke all on table private.profile_theme_catalog from public, anon, authenticated;

insert into private.profile_theme_catalog (theme_key, premium_product_id)
values
  ('none', null),
  ('azure', null),
  ('emerald', null),
  ('violet', null),
  ('rose', null),
  ('amber', null),
  ('ocean', null),
  ('twilight', null),
  ('astralis', 'profile-theme.astralis');

alter table public.profiles
  drop constraint profiles_profile_banner_check;

alter table public.profiles
  add constraint profiles_profile_banner_check
  check (profile_banner = any (array[
    'none'::text,
    'azure'::text,
    'emerald'::text,
    'violet'::text,
    'rose'::text,
    'amber'::text,
    'ocean'::text,
    'twilight'::text,
    'astralis'::text
  ]));

create or replace function public.set_my_profile_banner(candidate_banner text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_theme text := pg_catalog.lower(pg_catalog.btrim(candidate_banner));
  v_premium_product_id text;
  v_saved_theme text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated account is unavailable.';
  end if;

  select theme_row.premium_product_id
  into v_premium_product_id
  from private.profile_theme_catalog as theme_row
  where theme_row.theme_key = v_theme;

  if not found then
    raise exception using errcode = '22023', message = 'The profile theme is invalid.';
  end if;

  if v_premium_product_id is not null
    and not private.can_access_premium_product(v_user_id, v_premium_product_id) then
    raise exception using errcode = '42501', message = 'This Elite profile theme is not available for this account.';
  end if;

  update public.profiles as profile_row
  set profile_banner = v_theme
  where profile_row.id = v_user_id
  returning profile_row.profile_banner into v_saved_theme;

  if v_saved_theme is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_saved_theme;
end;
$function$;

revoke all on function public.set_my_profile_banner(text) from public, anon, authenticated;
grant execute on function public.set_my_profile_banner(text) to authenticated;

-- Preserve the deployed profile-column read/write boundary from the free
-- foundation while replacing only the validated setter implementation.
revoke update (profile_banner) on table public.profiles from public, anon, authenticated;

comment on column public.profiles.profile_banner is
  'Public-safe bounded Profile Theme preference. Premium keys require authorization only when equipped.';

comment on function public.set_my_profile_banner(text) is
  'Updates only auth.uid() Profile Theme for an active account. Premium keys resolve through the private bounded catalog and centralized product access.';

do $verify$
declare
  v_setter_oid oid := pg_catalog.to_regprocedure('public.set_my_profile_banner(text)');
  v_catalog_oid oid := pg_catalog.to_regclass('private.profile_theme_catalog');
  v_setter_owner_oid oid;
  v_anon_role_oid oid;
  v_authenticated_role_oid oid;
begin
  select role_row.oid into v_anon_role_oid
  from pg_catalog.pg_roles as role_row
  where role_row.rolname = 'anon';

  select role_row.oid into v_authenticated_role_oid
  from pg_catalog.pg_roles as role_row
  where role_row.rolname = 'authenticated';

  if v_anon_role_oid is null or v_authenticated_role_oid is null then
    raise exception 'The expected Supabase browser roles are unavailable.';
  end if;

  if (select pg_catalog.count(*) from private.premium_products where product_id = 'profile-theme.astralis' and development_preview_flag_key = 'astralis_profile_theme_preview') <> 1
    or (select pg_catalog.count(*) from private.development_feature_flags where flag_key = 'astralis_profile_theme_preview' and not enabled) <> 1 then
    raise exception 'Astralis premium registration failed verification.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'private.premium_products'::regclass
      and constraint_row.conname = 'premium_products_id_check'
      and constraint_row.contype = 'c'
  ) or exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id <> pg_catalog.btrim(product_row.product_id)
      or pg_catalog.char_length(product_row.product_id) not between 3 and 100
      or product_row.product_id !~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
  ) then
    raise exception 'The bounded premium-product identity constraint failed verification.';
  end if;

  if v_catalog_oid is null
    or (select pg_catalog.count(*) from private.profile_theme_catalog) <> 9
    or exists (
      select expected.theme_key, expected.premium_product_id
      from (values
        ('none'::text, null::text),
        ('azure', null),
        ('emerald', null),
        ('violet', null),
        ('rose', null),
        ('amber', null),
        ('ocean', null),
        ('twilight', null),
        ('astralis', 'profile-theme.astralis')
      ) as expected(theme_key, premium_product_id)
      except
      select actual.theme_key, actual.premium_product_id
      from private.profile_theme_catalog as actual
    ) then
    raise exception 'The private 9-row Profile Theme catalog failed verification.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'profile-theme.astralis'
      or billing_product.premium_product_id = 'profile-theme.astralis'
  ) then
    raise exception 'Astralis must not receive a billing catalog row in this milestone.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.profiles'::regclass
      and attribute_row.attname = 'profile_banner'
      and attribute_row.atttypid = 'text'::regtype
      and attribute_row.attnotnull
      and attribute_row.attnum > 0
      and not attribute_row.attisdropped
      and exists (
        select 1
        from pg_catalog.pg_attrdef as default_row
        where default_row.adrelid = attribute_row.attrelid
          and default_row.adnum = attribute_row.attnum
          and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''none''::text'
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_profile_banner_check'
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%none%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%azure%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%emerald%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%violet%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%rose%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%amber%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%ocean%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%twilight%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%astralis%'
  ) or exists (
    select 1
    from public.profiles as profile_row
    where profile_row.profile_banner <> all (array[
      'none'::text,
      'azure'::text,
      'emerald'::text,
      'violet'::text,
      'rose'::text,
      'amber'::text,
      'ocean'::text,
      'twilight'::text,
      'astralis'::text
    ])
  ) then
    raise exception 'The bounded Profile Theme column failed verification.';
  end if;

  if v_setter_oid is null or not exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid = v_setter_oid
      and procedure_row.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(procedure_row.proconfig) as function_setting(setting)
        where pg_catalog.btrim(pg_catalog.split_part(function_setting.setting, '=', 1)) = 'search_path'
          and pg_catalog.btrim(pg_catalog.split_part(function_setting.setting, '=', 2), E' \t"') = ''
      )
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%auth.uid()%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.is_active_account%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.profile_theme_catalog%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.can_access_premium_product%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%where profile_row.id = v_user_id%'
  ) then
    raise exception 'The secure generic Profile Theme setter failed verification.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('anon', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('public', v_setter_oid, 'execute') then
    raise exception 'The Profile Theme setter execute privileges failed verification.';
  end if;

  select procedure_row.proowner into v_setter_owner_oid
  from pg_catalog.pg_proc as procedure_row
  where procedure_row.oid = v_setter_oid;

  if v_setter_owner_oid is null
    or not pg_catalog.has_schema_privilege(v_setter_owner_oid, 'private', 'usage')
    or not pg_catalog.has_table_privilege(v_setter_owner_oid, v_catalog_oid, 'select')
    or not pg_catalog.has_table_privilege(v_setter_owner_oid, 'public.profiles'::regclass, 'update')
    or not pg_catalog.has_function_privilege(v_setter_owner_oid, pg_catalog.to_regprocedure('private.is_active_account(uuid)'), 'execute')
    or not pg_catalog.has_function_privilege(v_setter_owner_oid, pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)'), 'execute') then
    raise exception 'The Profile Theme setter owner cannot access its required private dependencies.';
  end if;

  if exists (
      select 1
      from (values ('anon'::name), ('authenticated'::name), ('public'::name)) as browser_role(role_name)
      cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text), ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)) as denied_privilege(privilege_name)
      where pg_catalog.has_table_privilege(browser_role.role_name, v_catalog_oid, denied_privilege.privilege_name)
    )
    or exists (
      select 1
      from (values ('anon'::name), ('authenticated'::name), ('public'::name)) as browser_role(role_name)
      cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('REFERENCES'::text)) as denied_column_privilege(privilege_name)
      where pg_catalog.has_any_column_privilege(browser_role.role_name, v_catalog_oid, denied_column_privilege.privilege_name)
    )
    or not exists (
      select 1
      from pg_catalog.pg_class as relation_row
      where relation_row.oid = v_catalog_oid
        and relation_row.relrowsecurity
    )
    or exists (
      select 1
      from pg_catalog.pg_policy as policy_row
      where policy_row.polrelid = v_catalog_oid
        and policy_row.polpermissive
        and (
          0::oid = any (policy_row.polroles)
          or v_anon_role_oid = any (policy_row.polroles)
          or v_authenticated_role_oid = any (policy_row.polroles)
        )
    ) then
    raise exception 'The private Profile Theme catalog browser-isolation verification failed.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_row
    where relation_row.oid = 'public.profiles'::regclass
      and relation_row.relrowsecurity
  ) or exists (
    select 1
    from pg_catalog.pg_policy as policy_row
    where policy_row.polrelid = 'public.profiles'::regclass
      and policy_row.polpermissive
      and policy_row.polcmd in ('w', '*')
      and (
        0::oid = any (policy_row.polroles)
        or v_anon_role_oid = any (policy_row.polroles)
        or v_authenticated_role_oid = any (policy_row.polroles)
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
      and 'profile_banner'::name = any (publication_table.attnames)
  ) then
    raise exception 'Profile Theme RLS write boundary or Realtime preservation failed verification.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
