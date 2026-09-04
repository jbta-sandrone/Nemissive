begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.profile_theme_catalog') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.billing_purchases') is null
    or pg_catalog.to_regclass('private.billing_subscriptions') is null
    or pg_catalog.to_regclass('private.billing_webhook_events') is null
    or pg_catalog.to_regprocedure('private.sync_billing_product_ownership(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.effective_elite_expires_at(uuid)') is null
    or pg_catalog.to_regprocedure('public.authorize_billing_checkout(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)') is null then
    raise exception 'Elite Profile Theme billing requires the completed billing and seven-theme premium foundations.';
  end if;

  if (select pg_catalog.count(*) from private.profile_theme_catalog) <> 15
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
    raise exception 'The private Profile Theme catalog is not the expected final 15-row collection.';
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
  ) <> 7 then
    raise exception 'The seven canonical Elite Profile Theme premium products are incomplete or inconsistent.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = any (array[
      'astralis_profile_theme_preview'::text,
      'hanami_profile_theme_preview'::text,
      'coralline_profile_theme_preview'::text,
      'regalia_profile_theme_preview'::text,
      'tempest_profile_theme_preview'::text,
      'bladeworn_profile_theme_preview'::text,
      'shadow_profile_theme_preview'::text
    ])
      and not feature_flag.enabled
  ) <> 7 then
    raise exception 'The seven Elite Profile Theme development-preview flags must exist and be disabled before billing registration.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = any (array[
      'profile-theme.astralis'::text,
      'profile-theme.hanami'::text,
      'profile-theme.coralline'::text,
      'profile-theme.regalia'::text,
      'profile-theme.tempest'::text,
      'profile-theme.bladeworn'::text,
      'profile-theme.shadow'::text
    ])
      or billing_product.premium_product_id = any (array[
        'profile-theme.astralis'::text,
        'profile-theme.hanami'::text,
        'profile-theme.coralline'::text,
        'profile-theme.regalia'::text,
        'profile-theme.tempest'::text,
        'profile-theme.bladeworn'::text,
        'profile-theme.shadow'::text
      ])
  ) then
    raise exception 'Elite Profile Theme billing is already partially registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Provider identifiers remain server-only environment configuration. These
-- rows register only trusted Nemissive product identity and display metadata.
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
  ('profile-theme.astralis', 'one_time', 'profile-theme.astralis', null, 29900, 'PHP', null),
  ('profile-theme.hanami', 'one_time', 'profile-theme.hanami', null, 29900, 'PHP', null),
  ('profile-theme.coralline', 'one_time', 'profile-theme.coralline', null, 29900, 'PHP', null),
  ('profile-theme.regalia', 'one_time', 'profile-theme.regalia', null, 29900, 'PHP', null),
  ('profile-theme.tempest', 'one_time', 'profile-theme.tempest', null, 29900, 'PHP', null),
  ('profile-theme.bladeworn', 'one_time', 'profile-theme.bladeworn', null, 29900, 'PHP', null),
  ('profile-theme.shadow', 'one_time', 'profile-theme.shadow', null, 29900, 'PHP', null);

do $verify$
declare
  v_billing_catalog_oid oid := pg_catalog.to_regclass('private.billing_product_catalog');
begin
  if (
    select pg_catalog.count(*)
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = any (array[
      'profile-theme.astralis'::text,
      'profile-theme.hanami'::text,
      'profile-theme.coralline'::text,
      'profile-theme.regalia'::text,
      'profile-theme.tempest'::text,
      'profile-theme.bladeworn'::text,
      'profile-theme.shadow'::text
    ])
      and billing_product.product_id = billing_product.premium_product_id
      and billing_product.billing_type = 'one_time'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 29900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) <> 7 then
    raise exception 'Elite Profile Theme billing catalog verification failed.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.billing_product_catalog as billing_product
    where billing_product.product_id like 'profile-theme.%'
      or billing_product.premium_product_id like 'profile-theme.%'
  ) <> 7 then
    raise exception 'The Profile Theme billing catalog contains unexpected or duplicate mappings.';
  end if;

  if exists (
    select expected.product_id
    from (values
      ('profile-theme.astralis'::text),
      ('profile-theme.hanami'),
      ('profile-theme.coralline'),
      ('profile-theme.regalia'),
      ('profile-theme.tempest'),
      ('profile-theme.bladeworn'),
      ('profile-theme.shadow')
    ) as expected(product_id)
    except
    select billing_product.product_id
    from private.billing_product_catalog as billing_product
    where billing_product.product_id like 'profile-theme.%'
      and billing_product.product_id = billing_product.premium_product_id
      and billing_product.billing_type = 'one_time'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 29900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) then
    raise exception 'One or more canonical Elite Profile Theme billing mappings are missing.';
  end if;

  if v_billing_catalog_oid is null
    or not exists (
      select 1
      from pg_catalog.pg_class as relation_row
      where relation_row.oid = v_billing_catalog_oid
        and relation_row.relrowsecurity
    )
    or exists (
      select 1
      from (values ('anon'::name), ('authenticated'::name), ('public'::name)) as browser_role(role_name)
      cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text), ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)) as denied_privilege(privilege_name)
      where pg_catalog.has_table_privilege(browser_role.role_name, v_billing_catalog_oid, denied_privilege.privilege_name)
    )
    or exists (
      select 1
      from (values ('anon'::name), ('authenticated'::name), ('public'::name)) as browser_role(role_name)
      cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('REFERENCES'::text)) as denied_column_privilege(privilege_name)
      where pg_catalog.has_any_column_privilege(browser_role.role_name, v_billing_catalog_oid, denied_column_privilege.privilege_name)
    ) then
    raise exception 'The private billing catalog browser-isolation verification failed.';
  end if;
end;
$verify$;

commit;
