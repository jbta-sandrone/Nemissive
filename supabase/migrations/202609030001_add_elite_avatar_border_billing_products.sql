begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.avatar_border_catalog') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.billing_purchases') is null
    or pg_catalog.to_regclass('private.billing_subscriptions') is null
    or pg_catalog.to_regclass('private.billing_webhook_events') is null
    or pg_catalog.to_regprocedure('private.sync_billing_product_ownership(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.can_access_premium_product(uuid,text)') is null
    or pg_catalog.to_regprocedure('private.effective_elite_expires_at(uuid)') is null
    or pg_catalog.to_regprocedure('public.authorize_billing_checkout(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)') is null then
    raise exception 'Elite avatar-border billing requires the completed billing and 19-border premium-product foundations.';
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
    raise exception 'The private avatar-border catalog is not the expected final 19-row collection.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.premium_products as product_row
    where (product_row.product_id, product_row.development_preview_flag_key) in (
      ('border.aurelia', 'aurelia_border_preview'),
      ('border.moonveil', 'moonveil_border_preview'),
      ('border.prismara', 'prismara_border_preview'),
      ('border.solstice', 'solstice_border_preview'),
      ('border.scarlet', 'scarlet_border_preview'),
      ('border.tidal', 'tidal_border_preview'),
      ('border.inferno', 'inferno_border_preview'),
      ('border.frost', 'frost_border_preview'),
      ('border.orbit', 'orbit_border_preview'),
      ('border.chrono', 'chrono_border_preview'),
      ('border.zenith', 'zenith_border_preview')
    )
  ) <> 11 then
    raise exception 'The 11 canonical Elite avatar-border premium products are incomplete or inconsistent.';
  end if;

  if (
    select pg_catalog.count(*)
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = any (array[
      'aurelia_border_preview'::text,
      'moonveil_border_preview'::text,
      'prismara_border_preview'::text,
      'solstice_border_preview'::text,
      'scarlet_border_preview'::text,
      'tidal_border_preview'::text,
      'inferno_border_preview'::text,
      'frost_border_preview'::text,
      'orbit_border_preview'::text,
      'chrono_border_preview'::text,
      'zenith_border_preview'::text
    ])
      and not feature_flag.enabled
  ) <> 11 then
    raise exception 'The 11 Elite avatar-border development-preview flags must exist and be disabled before billing registration.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = any (array[
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
      or billing_product.premium_product_id = any (array[
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
    raise exception 'Elite avatar-border billing is already partially registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Provider variant IDs remain server-only environment configuration. These
-- rows register local product identity and authoritative display metadata.
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
  ('border.aurelia', 'one_time', 'border.aurelia', null, 9900, 'PHP', null),
  ('border.moonveil', 'one_time', 'border.moonveil', null, 9900, 'PHP', null),
  ('border.prismara', 'one_time', 'border.prismara', null, 9900, 'PHP', null),
  ('border.solstice', 'one_time', 'border.solstice', null, 9900, 'PHP', null),
  ('border.scarlet', 'one_time', 'border.scarlet', null, 9900, 'PHP', null),
  ('border.tidal', 'one_time', 'border.tidal', null, 9900, 'PHP', null),
  ('border.inferno', 'one_time', 'border.inferno', null, 9900, 'PHP', null),
  ('border.frost', 'one_time', 'border.frost', null, 9900, 'PHP', null),
  ('border.orbit', 'one_time', 'border.orbit', null, 9900, 'PHP', null),
  ('border.chrono', 'one_time', 'border.chrono', null, 9900, 'PHP', null),
  ('border.zenith', 'one_time', 'border.zenith', null, 9900, 'PHP', null);

do $verify$
begin
  if (
    select pg_catalog.count(*)
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = any (array[
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
      and billing_product.product_id = billing_product.premium_product_id
      and billing_product.billing_type = 'one_time'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 9900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) <> 11 then
    raise exception 'Elite avatar-border billing catalog verification failed.';
  end if;

  if exists (
    select expected.product_id
    from (values
      ('border.aurelia'::text),
      ('border.moonveil'),
      ('border.prismara'),
      ('border.solstice'),
      ('border.scarlet'),
      ('border.tidal'),
      ('border.inferno'),
      ('border.frost'),
      ('border.orbit'),
      ('border.chrono'),
      ('border.zenith')
    ) as expected(product_id)
    except
    select billing_product.product_id
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = billing_product.premium_product_id
      and billing_product.billing_type = 'one_time'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 9900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) then
    raise exception 'One or more canonical Elite avatar-border billing mappings are missing.';
  end if;
end;
$verify$;

commit;
