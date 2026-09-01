begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.avatar_border_catalog') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.get_my_premium_access()') is null
    or pg_catalog.to_regprocedure('public.set_my_avatar_border(text)') is null then
    raise exception 'Elite avatar borders #5-#11 require the completed generic avatar-border and centralized premium-access foundations.';
  end if;

  if (select pg_catalog.count(*) from private.avatar_border_catalog) <> 12
    or exists (
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
    raise exception 'The existing avatar-border catalog is not the expected 12-row #1-#4 foundation.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.premium_products as product_row
    where (product_row.product_id, product_row.development_preview_flag_key) in (
      ('border.aurelia', 'aurelia_border_preview'),
      ('border.moonveil', 'moonveil_border_preview'),
      ('border.prismara', 'prismara_border_preview'),
      ('border.solstice', 'solstice_border_preview')
    )
  ) <> 4 then
    raise exception 'The existing Elite avatar-border premium products are incomplete or inconsistent.';
  end if;

  if exists (
    select 1
    from private.development_feature_flags
    where flag_key = any (array[
      'scarlet_border_preview'::text,
      'tidal_border_preview'::text,
      'inferno_border_preview'::text,
      'frost_border_preview'::text,
      'orbit_border_preview'::text,
      'chrono_border_preview'::text,
      'zenith_border_preview'::text
    ])
  ) or exists (
    select 1
    from private.premium_products
    where product_id = any (array[
      'border.scarlet'::text,
      'border.tidal'::text,
      'border.inferno'::text,
      'border.frost'::text,
      'border.orbit'::text,
      'border.chrono'::text,
      'border.zenith'::text
    ])
  ) or exists (
    select 1
    from private.billing_product_catalog
    where product_id = any (array[
      'border.scarlet'::text,
      'border.tidal'::text,
      'border.inferno'::text,
      'border.frost'::text,
      'border.orbit'::text,
      'border.chrono'::text,
      'border.zenith'::text
    ])
      or premium_product_id = any (array[
        'border.scarlet'::text,
        'border.tidal'::text,
        'border.inferno'::text,
        'border.frost'::text,
        'border.orbit'::text,
        'border.chrono'::text,
        'border.zenith'::text
      ])
  ) then
    raise exception 'Elite avatar borders #5-#11 are already partially registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

insert into private.development_feature_flags (flag_key, enabled)
values
  ('scarlet_border_preview', false),
  ('tidal_border_preview', false),
  ('inferno_border_preview', false),
  ('frost_border_preview', false),
  ('orbit_border_preview', false),
  ('chrono_border_preview', false),
  ('zenith_border_preview', false);

insert into private.premium_products (product_id, development_preview_flag_key)
values
  ('border.scarlet', 'scarlet_border_preview'),
  ('border.tidal', 'tidal_border_preview'),
  ('border.inferno', 'inferno_border_preview'),
  ('border.frost', 'frost_border_preview'),
  ('border.orbit', 'orbit_border_preview'),
  ('border.chrono', 'chrono_border_preview'),
  ('border.zenith', 'zenith_border_preview');

insert into private.avatar_border_catalog (border_key, premium_product_id)
values
  ('scarlet', 'border.scarlet'),
  ('tidal', 'border.tidal'),
  ('inferno', 'border.inferno'),
  ('frost', 'border.frost'),
  ('orbit', 'border.orbit'),
  ('chrono', 'border.chrono'),
  ('zenith', 'border.zenith');

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
    'solstice'::text,
    'scarlet'::text,
    'tidal'::text,
    'inferno'::text,
    'frost'::text,
    'orbit'::text,
    'chrono'::text,
    'zenith'::text
  ]));

do $verify$
declare
  v_setter_oid oid := pg_catalog.to_regprocedure('public.set_my_avatar_border(text)');
  v_catalog_oid oid := pg_catalog.to_regclass('private.avatar_border_catalog');
  v_setter_owner_oid oid;
  v_anon_role_oid oid;
  v_authenticated_role_oid oid;
begin
  select role_row.oid
  into v_anon_role_oid
  from pg_catalog.pg_roles as role_row
  where role_row.rolname = 'anon';

  select role_row.oid
  into v_authenticated_role_oid
  from pg_catalog.pg_roles as role_row
  where role_row.rolname = 'authenticated';

  if v_anon_role_oid is null or v_authenticated_role_oid is null then
    raise exception 'The expected Supabase browser roles are unavailable.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.premium_products as product_row
    where (product_row.product_id, product_row.development_preview_flag_key) in (
      ('border.scarlet', 'scarlet_border_preview'),
      ('border.tidal', 'tidal_border_preview'),
      ('border.inferno', 'inferno_border_preview'),
      ('border.frost', 'frost_border_preview'),
      ('border.orbit', 'orbit_border_preview'),
      ('border.chrono', 'chrono_border_preview'),
      ('border.zenith', 'zenith_border_preview')
    )
  ) <> 7 or (
    select pg_catalog.count(*)
    from private.development_feature_flags
    where flag_key = any (array[
      'scarlet_border_preview'::text,
      'tidal_border_preview'::text,
      'inferno_border_preview'::text,
      'frost_border_preview'::text,
      'orbit_border_preview'::text,
      'chrono_border_preview'::text,
      'zenith_border_preview'::text
    ])
      and not enabled
  ) <> 7 then
    raise exception 'Elite avatar-border #5-#11 registrations failed verification.';
  end if;

  if (select pg_catalog.count(*) from private.avatar_border_catalog) <> 19
    or exists (
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
        ('solstice', 'border.solstice'),
        ('scarlet', 'border.scarlet'),
        ('tidal', 'border.tidal'),
        ('inferno', 'border.inferno'),
        ('frost', 'border.frost'),
        ('orbit', 'border.orbit'),
        ('chrono', 'border.chrono'),
        ('zenith', 'border.zenith')
      ) as expected(border_key, premium_product_id)
      except
      select actual.border_key, actual.premium_product_id
      from private.avatar_border_catalog as actual
    ) then
    raise exception 'The final 19-row avatar-border catalog failed verification.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog
    where product_id = any (array[
      'border.aurelia'::text,
      'border.moonveil'::text,
      'border.prismara'::text,
      'border.solstice'::text,
      'border.scarlet'::text,
      'border.tidal'::text,
      'border.inferno'::text,
      'border.frost'::text,
      'border.orbit'::text,
      'border.chrono'::text,
      'border.zenith'::text
    ])
      or premium_product_id = any (array[
        'border.aurelia'::text,
        'border.moonveil'::text,
        'border.prismara'::text,
        'border.solstice'::text,
        'border.scarlet'::text,
        'border.tidal'::text,
        'border.inferno'::text,
        'border.frost'::text,
        'border.orbit'::text,
        'border.chrono'::text,
        'border.zenith'::text
      ])
  ) then
    raise exception 'Elite avatar borders must not have billing catalog rows before the billing milestone.';
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
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%scarlet%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%tidal%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%inferno%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%frost%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%orbit%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%chrono%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%zenith%'
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
        from pg_catalog.unnest(procedure_row.proconfig) as function_setting(setting)
        where pg_catalog.btrim(pg_catalog.split_part(function_setting.setting, '=', 1)) = 'search_path'
          and pg_catalog.btrim(
            pg_catalog.split_part(function_setting.setting, '=', 2),
            E' \t"'
          ) = ''
      )
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%auth.uid()%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.is_active_account%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.avatar_border_catalog%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%private.can_access_premium_product%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_row.oid)) like '%where profile_row.id = v_user_id%'
  ) then
    raise exception 'The secure generic avatar-border setter failed verification.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('anon', v_setter_oid, 'execute')
    or pg_catalog.has_function_privilege('public', v_setter_oid, 'execute') then
    raise exception 'The avatar-border setter execute privileges failed verification.';
  end if;

  select procedure_row.proowner
  into v_setter_owner_oid
  from pg_catalog.pg_proc as procedure_row
  where procedure_row.oid = v_setter_oid;

  if v_setter_owner_oid is null
    or not pg_catalog.has_schema_privilege(v_setter_owner_oid, 'private', 'usage')
    or not pg_catalog.has_table_privilege(v_setter_owner_oid, v_catalog_oid, 'select')
    or not pg_catalog.has_table_privilege(v_setter_owner_oid, 'public.profiles'::regclass, 'update')
    or not pg_catalog.has_function_privilege(
      v_setter_owner_oid,
      pg_catalog.to_regprocedure('private.is_active_account(uuid)'),
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      v_setter_owner_oid,
      pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)'),
      'execute'
    ) then
    raise exception 'The avatar-border setter owner cannot access its required private dependencies.';
  end if;

  -- Schema USAGE alone does not grant table access. Authenticated legitimately
  -- has private-schema USAGE for vetted private functions elsewhere in the
  -- application, so verify the catalog's effective table boundary instead.
  -- PostgreSQL privilege inquiry functions interpret the role name `public`
  -- as the PUBLIC pseudo-role.
  if exists (
      select 1
      from (values
        ('anon'::name),
        ('authenticated'::name),
        ('public'::name)
      ) as browser_role(role_name)
      cross join (values
        ('SELECT'::text),
        ('INSERT'::text),
        ('UPDATE'::text),
        ('DELETE'::text),
        ('TRUNCATE'::text),
        ('REFERENCES'::text),
        ('TRIGGER'::text)
      ) as denied_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        browser_role.role_name,
        v_catalog_oid,
        denied_privilege.privilege_name
      )
    )
    or exists (
      select 1
      from (values
        ('anon'::name),
        ('authenticated'::name),
        ('public'::name)
      ) as browser_role(role_name)
      cross join (values
        ('SELECT'::text),
        ('INSERT'::text),
        ('UPDATE'::text),
        ('REFERENCES'::text)
      ) as denied_column_privilege(privilege_name)
      where pg_catalog.has_any_column_privilege(
        browser_role.role_name,
        v_catalog_oid,
        denied_column_privilege.privilege_name
      )
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
    raise exception 'The private avatar-border catalog browser-isolation verification failed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
