begin;

do $preflight$
begin
  if pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.development_feature_flags') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.billing_purchases') is null
    or pg_catalog.to_regclass('private.billing_webhook_events') is null
    or pg_catalog.to_regprocedure('private.sync_billing_product_ownership(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.authorize_billing_checkout(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)') is null then
    raise exception 'Void billing requires the billing foundation and Void theme migration through 202608300007.';
  end if;

  if not exists (
    select 1
    from private.development_feature_flags as feature_flag
    where feature_flag.flag_key = 'void_theme_preview'
  ) then
    raise exception 'The canonical Void development-preview flag is not registered.';
  end if;

  if not exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.void'
      and product_row.development_preview_flag_key = 'void_theme_preview'
  ) then
    raise exception 'The canonical Void premium product is not registered.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.void'
      or billing_product.premium_product_id = 'theme.void'
  ) then
    raise exception 'Void billing is already registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Provider product identifiers remain server environment configuration. This row is
-- the private local product identity and authoritative presentation metadata.
insert into private.billing_product_catalog (
  product_id,
  billing_type,
  premium_product_id,
  account_plan,
  display_amount_minor,
  currency,
  billing_interval
)
values (
  'theme.void',
  'one_time',
  'theme.void',
  null,
  29900,
  'PHP',
  null
);

do $verify$
begin
  if (
    select pg_catalog.count(*)
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.void'
      and billing_product.billing_type = 'one_time'
      and billing_product.premium_product_id = 'theme.void'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 29900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) <> 1 then
    raise exception 'Void billing catalog verification failed.';
  end if;
end;
$verify$;

commit;
