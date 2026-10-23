-- =============================================================================
-- production_00011.sql — pgTAP suite for migration 00011 (production readiness)
-- =============================================================================
-- Proves:
--   * store_settings seeds + RLS (staff read, admin-only write)
--   * settings-driven tax/shipping totals in create_order_with_items()
--     (defaults reproduce the pre-00011 totals; free-shipping threshold case)
--   * create_checkout_session() records created_by and uses the same totals
--   * issue_order_refund(): happy path (partial + full), over-refund and
--     wrong-role rejection, order_events + audit_log writes
--   * set_low_stock_threshold(): works for warehouse, rejected for support,
--     negative and missing-variant rejection
--   * customer owner-read policies: the placing customer sees their order,
--     items and events; another customer sees none of them
--
-- Conventions match rls_policies.sql: one transaction, ROLLBACK at the end,
-- tests.sign_in_as() + SET ROLE to simulate signed-in users.
--
-- Run: supabase db test, or psql "$DATABASE_URL" -f supabase/tests/production_00011.sql
-- =============================================================================

begin;

select plan(31);

-- ---------------------------------------------------------------------------
-- Helpers (same definitions as rls_policies.sql)
-- ---------------------------------------------------------------------------
create schema if not exists tests;

create or replace function tests.sign_in_as(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function tests.sign_out()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

create or replace function tests.try_write(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'error:' || SQLSTATE || ':' || SQLERRM;
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on function tests.sign_in_as(uuid) to anon, authenticated;
grant execute on function tests.sign_out() to anon, authenticated;
grant execute on function tests.try_write(text) to anon, authenticated;

-- Stash for ids returned by the SECURITY DEFINER creators (try_write cannot
-- return values, so creations insert their returned id here).
create temp table test_stash (k text primary key, v uuid);
grant insert, select, update, delete on test_stash to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: admin / warehouse / support + two role-less customers, catalog,
-- one customer record, one signed-in shopper cart.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'ada@stockroom.test',   'x', now(), '{}', '{"full_name":"Ada Admin"}',     now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'wally@stockroom.test', 'x', now(), '{}', '{"full_name":"Wally Warehouse"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'sue@stockroom.test',   'x', now(), '{}', '{"full_name":"Sue Support"}',   now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'amy@shopper.test',     'x', now(), '{}', '{"full_name":"Amy Shopper"}',   now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'bob@shopper.test',     'x', now(), '{}', '{"full_name":"Bob Shopper"}',   now(), now());

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'warehouse'),
  ('33333333-3333-3333-3333-333333333333', 'support');
-- 55555555 / 66666666 are role-less customers.

insert into public.categories (id, name, slug) values
  ('c0000000-0000-0000-0000-000000000011', 'Prod Test', 'prod-test');

insert into public.products (id, title, slug, description, category_id, status) values
  ('d0000000-0000-0000-0000-000000000011', 'Prod Widget', 'prod-widget', '', 'c0000000-0000-0000-0000-000000000011', 'published');

insert into public.product_variants (id, product_id, title, sku, price) values
  ('e0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000011', 'Standard', 'PROD-1', 50.00);

update public.inventory_levels
   set quantity_on_hand = 100
 where variant_id = 'e0000000-0000-0000-0000-000000000011';

insert into public.customers (id, first_name, last_name, email) values
  ('f0000000-0000-0000-0000-000000000011', 'Test', 'Customer', 'prod.customer@example.com');

-- Amy's signed-in cart: 2 × $50 = $100 subtotal.
insert into public.carts (id, guest_token, user_id) values
  ('b0000000-0000-0000-0000-000000000011',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '55555555-5555-5555-5555-555555555555');

insert into public.cart_items (cart_id, variant_id, quantity) values
  ('b0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000011', 2);

-- ---------------------------------------------------------------------------
-- A. store_settings: seeds, staff read, admin-only write
-- ---------------------------------------------------------------------------
select ok(
  (select value from public.store_settings where key = 'tax_rate') = '0'::jsonb
  and (select value from public.store_settings where key = 'shipping_flat') = '0'::jsonb
  and (select value from public.store_settings where key = 'free_shipping_threshold') = 'null'::jsonb,
  '1. store_settings seeded: tax_rate=0, shipping_flat=0, free_shipping_threshold=null'
);

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  (select count(*) from public.store_settings)::int, 3,
  '2. support (staff) can read store_settings'
);
reset role;

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
with upd as (
  update public.store_settings set value = '99'::jsonb where key = 'tax_rate'
  returning 1
)
select is(
  (select count(*) from upd)::int, 0,
  '3. warehouse UPDATE of store_settings affects zero rows (admin write only)'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. Default totals: seeds reproduce the pre-00011 totals exactly
-- ---------------------------------------------------------------------------
select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into test_stash (k, v)
       select 'default_order', public.create_order_with_items(
         'f0000000-0000-0000-0000-000000000011',
         '[{"variant_id":"e0000000-0000-0000-0000-000000000011","quantity":2}]'
       ) $$
  ),
  'ok',
  '4. support creates an order with default settings'
);
reset role;

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'default_order')
      and subtotal = 100.00 and tax_total = 0 and shipping_total = 0 and total = 100.00
  ),
  '5. default settings: tax_total=0, shipping_total=0, total=subtotal (100.00)'
);

-- ---------------------------------------------------------------------------
-- C. Settings-driven totals in create_order_with_items()
-- ---------------------------------------------------------------------------
update public.store_settings set value = '0.10'::jsonb where key = 'tax_rate';
update public.store_settings set value = '5'::jsonb where key = 'shipping_flat';

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into test_stash (k, v)
       select 'taxed_order', public.create_order_with_items(
         'f0000000-0000-0000-0000-000000000011',
         '[{"variant_id":"e0000000-0000-0000-0000-000000000011","quantity":2}]'
       ) $$
  ),
  'ok',
  '6. support creates an order with tax_rate=0.10, shipping_flat=5'
);
reset role;

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'taxed_order')
      and tax_total = 10.00 and shipping_total = 5.00 and total = 115.00
  ),
  '7. taxed order: tax=round(100*0.10)=10.00, shipping=5.00, total=115.00'
);

-- Free-shipping threshold reached (100 >= 50): shipping drops to 0.
update public.store_settings set value = '50'::jsonb where key = 'free_shipping_threshold';

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into test_stash (k, v)
       select 'freeship_order', public.create_order_with_items(
         'f0000000-0000-0000-0000-000000000011',
         '[{"variant_id":"e0000000-0000-0000-0000-000000000011","quantity":2}]'
       ) $$
  ),
  'ok',
  '8. support creates an order at the free-shipping threshold'
);
reset role;

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'freeship_order')
      and tax_total = 10.00 and shipping_total = 0 and total = 110.00
  ),
  '9. threshold order: shipping=0 (100 >= 50), tax=10.00, total=110.00'
);

-- Raise the threshold above the checkout subtotal so checkout pays shipping.
update public.store_settings set value = '150'::jsonb where key = 'free_shipping_threshold';

-- ---------------------------------------------------------------------------
-- D. create_checkout_session(): created_by + same settings totals
-- ---------------------------------------------------------------------------
select tests.sign_in_as('55555555-5555-5555-5555-555555555555');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into test_stash (k, v)
       select 'checkout_order', public.create_checkout_session(
         'b0000000-0000-0000-0000-000000000011',
         'cccccccc-cccc-cccc-cccc-cccccccccccc'
       ) $$
  ),
  'ok',
  '10. signed-in customer checks out her own cart'
);
reset role;

select is(
  (select created_by from public.orders
    where id = (select v from test_stash where k = 'checkout_order')),
  '55555555-5555-5555-5555-555555555555'::uuid,
  '11. checkout order records created_by = auth.uid()'
);

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'checkout_order')
      and tax_total = 10.00 and shipping_total = 5.00 and total = 115.00
  ),
  '12. checkout totals use store_settings too: tax=10.00, shipping=5.00 (100 < 150 threshold), total=115.00'
);

-- ---------------------------------------------------------------------------
-- E. issue_order_refund(): happy path, limits, roles, timeline + audit
-- (target: taxed_order, total 115.00)
-- ---------------------------------------------------------------------------
select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select is(
  public.issue_order_refund(
    (select v from test_stash where k = 'taxed_order'), 15, 'test partial refund'),
  15.00::numeric,
  '13. support issues a partial refund of 15 — returns new refunded_total 15.00'
);

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'taxed_order')
      and refunded_total = 15.00
      and payment_status = 'partially_refunded'
      and status = 'pending'
  ),
  '14. partial refund: refunded_total=15.00, payment_status=partially_refunded, fulfillment status untouched'
);

select ok(
  tests.try_write(
    $$ select public.issue_order_refund(
         (select v from test_stash where k = 'taxed_order'), 200) $$
  ) like '%exceeds the remaining refundable amount%',
  '15. over-refund (200 > 115 - 15 remaining) is rejected'
);

select ok(
  tests.try_write(
    $$ select public.issue_order_refund(
         (select v from test_stash where k = 'taxed_order'), 0) $$
  ) like '%Refund amount must be greater than zero.%',
  '16. zero-amount refund is rejected'
);
reset role;

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select ok(
  tests.try_write(
    $$ select public.issue_order_refund(
         (select v from test_stash where k = 'taxed_order'), 5) $$
  ) like '%Only admins and support staff can issue refunds.%',
  '17. warehouse calling issue_order_refund() is denied by the role check'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  public.issue_order_refund(
    (select v from test_stash where k = 'taxed_order'), 100, 'test full refund'),
  115.00::numeric,
  '18. refunding the remaining 100 returns refunded_total 115.00 (full)'
);
reset role;

select ok(
  exists (
    select 1 from public.orders
    where id = (select v from test_stash where k = 'taxed_order')
      and refunded_total = 115.00
      and payment_status = 'refunded'
      and status = 'refunded'
  ),
  '19. full refund: payment_status=refunded and status=refunded'
);

select ok(
  (select count(*) from public.order_events
    where order_id = (select v from test_stash where k = 'taxed_order')
      and event_type = 'refund_issued') = 2
  and (select count(*) from public.audit_log
    where action = 'order.refund'
      and row_id = (select v from test_stash where k = 'taxed_order')::text) = 2,
  '20. both refunds wrote an order_events refund_issued row and an audit_log order.refund row'
);

-- ---------------------------------------------------------------------------
-- F. set_low_stock_threshold()
-- ---------------------------------------------------------------------------
select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select is(
  tests.try_write(
    $$ select public.set_low_stock_threshold(
         'e0000000-0000-0000-0000-000000000011', 3) $$
  ),
  'ok',
  '21. warehouse sets the low-stock threshold via set_low_stock_threshold()'
);
select is(
  (select low_stock_threshold from public.inventory_levels
    where variant_id = 'e0000000-0000-0000-0000-000000000011'),
  3,
  '22. inventory_levels.low_stock_threshold is now 3'
);
select ok(
  tests.try_write(
    $$ select public.set_low_stock_threshold(
         'e0000000-0000-0000-0000-000000000011', -1) $$
  ) like '%Low-stock threshold must be zero or greater.%',
  '23. negative threshold is rejected'
);
select ok(
  tests.try_write(
    $$ select public.set_low_stock_threshold(
         'e0000000-0000-0000-0000-000000000099', 5) $$
  ) like '%No inventory record for variant%',
  '24. threshold for a variant with no inventory row raises'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select ok(
  tests.try_write(
    $$ select public.set_low_stock_threshold(
         'e0000000-0000-0000-0000-000000000011', 7) $$
  ) like '%Only warehouse and admin staff can set low-stock thresholds.%',
  '25. support calling set_low_stock_threshold() is denied by the role check'
);
reset role;

-- ---------------------------------------------------------------------------
-- G. Customer owner-read: Amy sees her checkout order; Bob sees none of it
-- ---------------------------------------------------------------------------
select tests.sign_in_as('55555555-5555-5555-5555-555555555555');
set role authenticated;
select is(
  (select count(*) from public.orders
    where id = (select v from test_stash where k = 'checkout_order'))::int,
  1,
  '26. customer A reads her own order (orders_customer_read)'
);
select ok(
  (select count(*) from public.order_items
    where order_id = (select v from test_stash where k = 'checkout_order')) >= 1,
  '27. customer A reads her order items (order_items_customer_read)'
);
select ok(
  (select count(*) from public.order_events
    where order_id = (select v from test_stash where k = 'checkout_order')) >= 1,
  '28. customer A reads her order events (order_events_customer_read)'
);
reset role;

select tests.sign_in_as('66666666-6666-6666-6666-666666666666');
set role authenticated;
select is(
  (select count(*) from public.orders
    where id = (select v from test_stash where k = 'checkout_order'))::int,
  0,
  '29. customer B reads zero of customer A''s orders'
);
select is(
  (select count(*) from public.order_items
    where order_id = (select v from test_stash where k = 'checkout_order'))::int,
  0,
  '30. customer B reads zero of customer A''s order items'
);
select is(
  (select count(*) from public.order_events
    where order_id = (select v from test_stash where k = 'checkout_order'))::int,
  0,
  '31. customer B reads zero of customer A''s order events'
);
reset role;
select tests.sign_out();

-- ---------------------------------------------------------------------------
select * from finish();
rollback;
