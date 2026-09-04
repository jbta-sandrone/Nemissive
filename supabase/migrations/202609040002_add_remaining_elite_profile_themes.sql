begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.profile_theme_catalog') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.get_my_premium_access()') is null
    or pg_catalog.to_regprocedure('public.set_my_profile_banner(text)') is null then
    raise exception 'Elite Profile Themes #2-#7 require the deployed Astralis and centralized premium-access foundations.';
  end if;

  if (select pg_catalog.count(*) from private.profile_theme_catalog) <> 9
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
    )
    or exists (
      select actual.theme_key, actual.premium_product_id
      from private.profile_theme_catalog as actual
      except
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
    ) then
    raise exception 'The existing Profile Theme catalog is not the expected nine-row Astralis foundation.';
  end if;

  if (select pg_catalog.count(*) from private.premium_products where product_id = 'profile-theme.astralis' and development_preview_flag_key = 'astralis_profile_theme_preview') <> 1
    or (select pg_catalog.count(*) from private.development_feature_flags where flag_key = 'astralis_profile_theme_preview' and not enabled) <> 1 then
    raise exception 'The existing Astralis premium registration is incomplete or inconsistent.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_profile_banner_check'
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%astralis%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%hanami%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%coralline%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%regalia%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%tempest%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%bladeworn%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%shadow%'
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
    raise exception 'The deployed bounded Astralis profile preference is not in the expected state.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags
    where flag_key = any (array[
      'hanami_profile_theme_preview'::text,
      'coralline_profile_theme_preview'::text,
      'regalia_profile_theme_preview'::text,
      'tempest_profile_theme_preview'::text,
      'bladeworn_profile_theme_preview'::text,
      'shadow_profile_theme_preview'::text
    ])
  ) or exists (
    select 1
    from private.premium_products
    where product_id = any (array[
      'profile-theme.hanami'::text,
      'profile-theme.coralline'::text,
      'profile-theme.regalia'::text,
      'profile-theme.tempest'::text,
      'profile-theme.bladeworn'::text,
      'profile-theme.shadow'::text
    ])
  ) or exists (
    select 1
    from private.profile_theme_catalog
    where theme_key = any (array[
      'hanami'::text,
      'coralline'::text,
      'regalia'::text,
      'tempest'::text,
      'bladeworn'::text,
      'shadow'::text
    ])
  ) or exists (
    select 1
    from private.billing_product_catalog
    where product_id = any (array[
      'profile-theme.astralis'::text,
      'profile-theme.hanami'::text,
      'profile-theme.coralline'::text,
      'profile-theme.regalia'::text,
      'profile-theme.tempest'::text,
      'profile-theme.bladeworn'::text,
      'profile-theme.shadow'::text
    ])
      or premium_product_id = any (array[
        'profile-theme.astralis'::text,
        'profile-theme.hanami'::text,
        'profile-theme.coralline'::text,
        'profile-theme.regalia'::text,
        'profile-theme.tempest'::text,
        'profile-theme.bladeworn'::text,
        'profile-theme.shadow'::text
      ])
  ) then
    raise exception 'Elite Profile Themes #2-#7 are already partially registered or have unexpected billing rows.';
  end if;
end;
$preflight$;

insert into private.development_feature_flags (flag_key, enabled)
values
  ('hanami_profile_theme_preview', false),
  ('coralline_profile_theme_preview', false),
  ('regalia_profile_theme_preview', false),
  ('tempest_profile_theme_preview', false),
  ('bladeworn_profile_theme_preview', false),
  ('shadow_profile_theme_preview', false);

insert into private.premium_products (product_id, development_preview_flag_key)
values
  ('profile-theme.hanami', 'hanami_profile_theme_preview'),
  ('profile-theme.coralline', 'coralline_profile_theme_preview'),
  ('profile-theme.regalia', 'regalia_profile_theme_preview'),
  ('profile-theme.tempest', 'tempest_profile_theme_preview'),
  ('profile-theme.bladeworn', 'bladeworn_profile_theme_preview'),
  ('profile-theme.shadow', 'shadow_profile_theme_preview');

insert into private.profile_theme_catalog (theme_key, premium_product_id)
values
  ('hanami', 'profile-theme.hanami'),
  ('coralline', 'profile-theme.coralline'),
  ('regalia', 'profile-theme.regalia'),
  ('tempest', 'profile-theme.tempest'),
  ('bladeworn', 'profile-theme.bladeworn'),
  ('shadow', 'profile-theme.shadow');

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
    'astralis'::text,
    'hanami'::text,
    'coralline'::text,
    'regalia'::text,
    'tempest'::text,
    'bladeworn'::text,
    'shadow'::text
  ]));

-- Preserve the deployed private catalog and profile-column boundaries. Schema
-- USAGE is intentionally not revoked because it is shared by vetted private
-- functions; browser roles still receive no effective catalog privileges.
revoke all on table private.profile_theme_catalog from public, anon, authenticated;
revoke update (profile_banner) on table public.profiles from public, anon, authenticated;

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

  if (
    select pg_catalog.count(*)
    from private.premium_products as product_row
    where (product_row.product_id, product_row.development_preview_flag_key) in (
      ('profile-theme.astralis', 'astralis_profile_theme_preview'),
      ('profile-theme.hanami', 'hanami_profile_theme_preview'),
      ('profile-theme.coralline', 'coralline_profile_theme_preview'),
      ('profile-theme.regalia', 'regalia_profile_theme_preview'),
      ('profile-theme.tempest', 'tempest_profile_theme_preview'),
      ('profile-theme.bladeworn', 'bladeworn_profile_theme_preview'),
      ('profile-theme.shadow', 'shadow_profile_theme_preview')
    )
  ) <> 7 or (
    select pg_catalog.count(*)
    from private.development_feature_flags
    where flag_key = any (array[
      'astralis_profile_theme_preview'::text,
      'hanami_profile_theme_preview'::text,
      'coralline_profile_theme_preview'::text,
      'regalia_profile_theme_preview'::text,
      'tempest_profile_theme_preview'::text,
      'bladeworn_profile_theme_preview'::text,
      'shadow_profile_theme_preview'::text
    ])
      and not enabled
  ) <> 7 then
    raise exception 'The seven Elite Profile Theme registrations failed verification.';
  end if;

  if v_catalog_oid is null
    or (select pg_catalog.count(*) from private.profile_theme_catalog) <> 15
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
        ('astralis', 'profile-theme.astralis'),
        ('hanami', 'profile-theme.hanami'),
        ('coralline', 'profile-theme.coralline'),
        ('regalia', 'profile-theme.regalia'),
        ('tempest', 'profile-theme.tempest'),
        ('bladeworn', 'profile-theme.bladeworn'),
        ('shadow', 'profile-theme.shadow')
      ) as expected(theme_key, premium_product_id)
      except
      select actual.theme_key, actual.premium_product_id
      from private.profile_theme_catalog as actual
    )
    or exists (
      select actual.theme_key, actual.premium_product_id
      from private.profile_theme_catalog as actual
      except
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
        ('astralis', 'profile-theme.astralis'),
        ('hanami', 'profile-theme.hanami'),
        ('coralline', 'profile-theme.coralline'),
        ('regalia', 'profile-theme.regalia'),
        ('tempest', 'profile-theme.tempest'),
        ('bladeworn', 'profile-theme.bladeworn'),
        ('shadow', 'profile-theme.shadow')
      ) as expected(theme_key, premium_product_id)
    ) then
    raise exception 'The final 15-row Profile Theme catalog failed verification.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog
    where product_id = any (array[
      'profile-theme.astralis'::text,
      'profile-theme.hanami'::text,
      'profile-theme.coralline'::text,
      'profile-theme.regalia'::text,
      'profile-theme.tempest'::text,
      'profile-theme.bladeworn'::text,
      'profile-theme.shadow'::text
    ])
      or premium_product_id = any (array[
        'profile-theme.astralis'::text,
        'profile-theme.hanami'::text,
        'profile-theme.coralline'::text,
        'profile-theme.regalia'::text,
        'profile-theme.tempest'::text,
        'profile-theme.bladeworn'::text,
        'profile-theme.shadow'::text
      ])
  ) then
    raise exception 'Elite Profile Themes must not receive billing catalog rows in this milestone.';
  end if;

  if not exists (
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
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%hanami%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%coralline%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%regalia%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%tempest%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%bladeworn%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%shadow%'
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
      'astralis'::text,
      'hanami'::text,
      'coralline'::text,
      'regalia'::text,
      'tempest'::text,
      'bladeworn'::text,
      'shadow'::text
    ])
  ) then
    raise exception 'The final bounded Profile Theme constraint failed verification.';
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
  ) or not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
      and 'profile_banner'::name = any (publication_table.attnames)
  ) then
    raise exception 'Profile Theme RLS or Realtime preservation failed verification.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
