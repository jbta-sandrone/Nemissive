begin;

do $preflight$
begin
  if pg_catalog.to_regclass('private.premium_products') is null
    or pg_catalog.to_regclass('private.billing_product_catalog') is null
    or pg_catalog.to_regclass('private.billing_purchases') is null
    or pg_catalog.to_regclass('private.billing_webhook_events') is null
    or pg_catalog.to_regprocedure('private.sync_billing_product_ownership(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.authorize_billing_checkout(uuid,text)') is null
    or pg_catalog.to_regprocedure('public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)') is null then
    raise exception 'Glacier billing requires the billing foundation and Glacier theme migrations through 202608280003.';
  end if;

  if not exists (
    select 1
    from private.premium_products as product_row
    where product_row.product_id = 'theme.glacier'
      and product_row.development_preview_flag_key = 'glacier_theme_preview'
  ) then
    raise exception 'The canonical Glacier premium product is not registered.';
  end if;

  if exists (
    select 1
    from private.billing_product_catalog as billing_product
    where billing_product.product_id = 'theme.glacier'
      or billing_product.premium_product_id = 'theme.glacier'
  ) then
    raise exception 'Glacier billing is already registered; verify migration history before retrying.';
  end if;
end;
$preflight$;

-- Provider variant IDs remain server environment configuration. This row is
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
  'theme.glacier',
  'one_time',
  'theme.glacier',
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
    where billing_product.product_id = 'theme.glacier'
      and billing_product.billing_type = 'one_time'
      and billing_product.premium_product_id = 'theme.glacier'
      and billing_product.account_plan is null
      and billing_product.display_amount_minor = 29900
      and billing_product.currency = 'PHP'
      and billing_product.billing_interval is null
  ) <> 1 then
    raise exception 'Glacier billing catalog verification failed.';
  end if;
end;
$verify$;

commit;

-- Verification after applying (run as an administrative SQL role):
-- select product_id, billing_type, premium_product_id, account_plan,
--        display_amount_minor, currency, billing_interval
-- from private.billing_product_catalog
-- where product_id = 'theme.glacier';
--
-- select relrowsecurity
-- from pg_catalog.pg_class
-- where oid = 'private.billing_product_catalog'::regclass;
--
-- select has_schema_privilege('authenticated', 'private', 'usage') as authenticated_private_usage,
--        has_table_privilege('authenticated', 'private.billing_product_catalog', 'select,insert,update,delete') as authenticated_catalog_access,
--        has_table_privilege('authenticated', 'private.billing_purchases', 'select,insert,update,delete') as authenticated_purchase_access,
--        has_table_privilege('authenticated', 'private.billing_webhook_events', 'select,insert,update,delete') as authenticated_webhook_access,
--        has_function_privilege('authenticated', 'public.authorize_billing_checkout(uuid,text)', 'execute') as authenticated_checkout_authorizer,
--        has_function_privilege('authenticated', 'public.process_lemonsqueezy_webhook(text,text,text,text,bigint,bigint,boolean,uuid,text,text,integer,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)', 'execute') as authenticated_webhook_processor;
-- Expected: true for relrowsecurity; false for every authenticated privilege.
