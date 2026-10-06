-- =============================================================================
-- rls_policies.sql — pgTAP test suite for Stockroom Row Level Security
-- =============================================================================
-- What this is: proves the RLS policies in supabase/migrations/*.sql hold —
-- every forbidden write attempted as anon, warehouse, and support must fail.
--
-- How to run it (local Supabase, pgTAP installed):
--
--   1. Install the pgTAP extension once per local project:
--        supabase db reset            # or: psql -c "create extension pgtap;"
--   2. Run the suite:
--        supabase db test             # runs everything in supabase/tests/
--      or directly:
--        psql "$DATABASE_URL" -f supabase/tests/rls_policies.sql
--
-- Conventions:
--   * Every test runs inside one transaction and ROLLBACKs — tests never
--     pollute the database.
--   * `SET ROLE authenticated` + faking the JWT claims simulates a signed-in
--     user without touching the network:
--         select set_config('request.jwt.claims',
--                           json_build_object('sub', '<user-uuid>')::text, true);
--     Supabase's auth.uid() reads the `sub` claim, so policies behave exactly
--     as they do in production.
--   * `tests.try_write(sql)` runs arbitrary write SQL as the current role and
--     returns 'ok' or 'error:<sqlstate>:<message>' — the workhorse for
--     forbidden-write assertions.
--   * NOTE: inserting into auth.users directly requires a superuser role. On a
--     local `supabase db test` run you are postgres, so this works. On hosted
--     projects, run these tests against a local/staging clone — never prod.
-- =============================================================================

begin;

-- Update this number when you add tests: plan(N) must equal the test count.
select plan(39);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema if not exists tests;

-- Simulate a signed-in user for RLS: auth.uid() will return p_user_id.
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

-- Run write SQL as the current role. Returns 'ok', or
-- 'error:<sqlstate>:<message>' when it raises (RLS denial = 42501,
-- trigger guard = P0001 with our message).
create or replace function tests.try_write(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'error:' || SQLSTATE || ':' || SQLERRM;
end;
$$;

-- The suite SET ROLEs to authenticated/anon mid-file; those roles need USAGE
-- on the tests schema + EXECUTE on the helpers to keep working after the
-- role switch. (Test-only functions; the whole file runs in one transaction
-- and rolls back.)
grant usage on schema tests to anon, authenticated;
grant execute on function tests.sign_in_as(uuid) to anon, authenticated;
grant execute on function tests.sign_out() to anon, authenticated;
grant execute on function tests.try_write(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: four users (admin / warehouse / support / role-less) + catalog,
-- customer, order, cart, payment, audit row, broadcast notification.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'ada@stockroom.test',     'x', now(), '{}', '{"full_name":"Ada Admin"}',      now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'wally@stockroom.test',   'x', now(), '{}', '{"full_name":"Wally Warehouse"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'sue@stockroom.test',     'x', now(), '{}', '{"full_name":"Sue Support"}',     now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'nora@stockroom.test',    'x', now(), '{}', '{}',                               now(), now());

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'warehouse'),
  ('33333333-3333-3333-3333-333333333333', 'support');
-- 44444444 is intentionally role-less.

insert into public.categories (id, name, slug) values
  ('c0000000-0000-0000-0000-000000000001', 'Test', 'test');

insert into public.products (id, title, slug, description, category_id, status) values
  ('d0000000-0000-0000-0000-000000000001', 'Pub Widget',   'test-pub',   '', 'c0000000-0000-0000-0000-000000000001', 'published'),
  ('d0000000-0000-0000-0000-000000000002', 'Draft Widget', 'test-draft', '', 'c0000000-0000-0000-0000-000000000001', 'draft');

insert into public.product_variants (id, product_id, title, sku, price) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Standard', 'TEST-PUB-1',   10.00),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Standard', 'TEST-DRAFT-1', 12.00);

-- inventory_levels rows are auto-created by the variant trigger; set stock.
update public.inventory_levels
   set quantity_on_hand = 100
 where variant_id = 'e0000000-0000-0000-0000-000000000001';

insert into public.customers (id, first_name, last_name, email) values
  ('f0000000-0000-0000-0000-000000000001', 'Test', 'Customer', 'test.customer@example.com');

insert into public.orders (id, order_number, customer_id, status, payment_status, subtotal, total)
values ('a0000000-0000-0000-0000-000000000001', 'ORD-TEST-1',
        'f0000000-0000-0000-0000-000000000001', 'pending', 'pending', 10.00, 10.00);

insert into public.carts (id, guest_token) values
  ('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.cart_items (cart_id, variant_id, quantity) values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 2);

insert into public.payments (order_id, stripe_payment_intent_id, amount, status, idempotency_key)
values ('a0000000-0000-0000-0000-000000000001', 'pi_test_1', 10.00, 'pending', 'test:order-1');

insert into public.audit_log (actor_id, action, table_name, row_id)
values (null, 'test.seed', 'orders', 'a0000000-0000-0000-0000-000000000001');

insert into public.notifications (user_id, kind, title, body)
values (null, 'new_order', 'Seed broadcast', '');

-- ---------------------------------------------------------------------------
-- A. Role helpers
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'
      and email = 'ada@stockroom.test'
      and full_name = 'Ada Admin'
  ),
  '1. trigger creates a Stockroom-shaped profile (email + full_name) on signup'
);

select tests.sign_in_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select is(public.current_role(), 'admin', '2. current_role() returns admin for the admin user');
select ok(public.is_admin() and public.is_staff(), '3. is_admin() and is_staff() are true for admin');
reset role;

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select ok(
  public.current_role() = 'warehouse' and not public.is_admin() and public.is_staff(),
  '4. warehouse user: role=warehouse, not admin, is staff'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(public.current_role(), 'support', '5. current_role() returns support for the support user');
reset role;

select tests.sign_in_as('44444444-4444-4444-4444-444444444444');
set role authenticated;
select ok(
  public.current_role() is null and not public.is_staff(),
  '6. role-less user: current_role() is null, is_staff() is false'
);
reset role;
select tests.sign_out();

-- ---------------------------------------------------------------------------
-- B. Anon storefront reads: published catalog only, no carts
-- ---------------------------------------------------------------------------
select tests.sign_out();
set role anon;

select is(
  (select count(*) from public.products)::int, 1,
  '7. anon sees exactly the published product'
);
select is(
  (select count(*) from public.products where slug = 'test-draft')::int, 0,
  '8. anon cannot see the draft product'
);
select is(
  (select count(*) from public.product_variants where sku = 'TEST-DRAFT-1')::int, 0,
  '9. anon cannot read variants of the draft product'
);
select is(
  (select count(*) from public.carts)::int, 0,
  '10. anon cannot read carts without a guest token'
);

reset role;

-- ---------------------------------------------------------------------------
-- C. Warehouse: no direct inventory/order writes
-- ---------------------------------------------------------------------------
select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;

select ok(
  tests.try_write(
    $$ update public.inventory_levels
       set quantity_on_hand = 9999
     where variant_id = 'e0000000-0000-0000-0000-000000000001' $$
  ) like 'error:42501%',
  '11. warehouse direct UPDATE of inventory_levels is denied (42501)'
);

select ok(
  tests.try_write(
    $$ insert into public.inventory_adjustments
         (variant_id, delta, quantity_before, quantity_after, reason)
       values ('e0000000-0000-0000-0000-000000000001', 5, 100, 105, 'manual') $$
  ) like 'error:42501%',
  '12. warehouse INSERT into inventory_adjustments is denied (42501)'
);

select ok(
  tests.try_write(
    $$ insert into public.orders (order_number, subtotal, total)
       values ('ORD-ATTACK', 1, 1) $$
  ) like 'error:42501%',
  '13. warehouse direct INSERT into orders is denied (42501)'
);

select ok(
  tests.try_write(
    $$ delete from public.orders where id = 'a0000000-0000-0000-0000-000000000001' $$
  ) like 'error:42501%',
  '14. warehouse DELETE on orders is denied (42501)'
);

-- ---------------------------------------------------------------------------
-- D. Money-column guard
-- ---------------------------------------------------------------------------
with fulfil as (
  update public.orders set status = 'fulfilled'
   where id = 'a0000000-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*) from fulfil)::int, 1,
  '15. warehouse MAY update order status (fulfill path)'
);

select ok(
  tests.try_write(
    $$ update public.orders set total = 9999
       where id = 'a0000000-0000-0000-0000-000000000001' $$
  ) like '%Only admins can change order money columns.%',
  '16. warehouse UPDATE of orders.total is blocked by the money guard'
);

reset role;
select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;

select ok(
  tests.try_write(
    $$ update public.orders set refunded_total = 5
       where id = 'a0000000-0000-0000-0000-000000000001' $$
  ) like '%Only admins can change order money columns.%',
  '17. support UPDATE of orders.refunded_total is blocked by the money guard'
);

reset role;

-- ---------------------------------------------------------------------------
-- E. Discount writes: admin full, support apology-insert, warehouse none
-- ---------------------------------------------------------------------------
select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select ok(
  tests.try_write(
    $$ insert into public.discounts (code, kind, value) values ('HACK20', 'percentage', 20) $$
  ) like 'error:42501%',
  '18. warehouse INSERT into discounts is denied (42501)'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into public.discounts (code, kind, value, usage_limit, per_customer_limit)
       values ('SORRY10', 'percentage', 10, 1, 1) $$
  ),
  'ok',
  '19. support MAY insert a one-time apology discount'
);
reset role;

select tests.sign_in_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select is(
  tests.try_write(
    $$ insert into public.discounts (code, kind, value) values ('ADMIN20', 'percentage', 20) $$
  ),
  'ok',
  '20. admin MAY insert a discount'
);
reset role;

-- ---------------------------------------------------------------------------
-- F. Customer writes: admin + support only
-- ---------------------------------------------------------------------------
select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
with edit as (
  update public.customers set notes = 'support was here'
   where id = 'f0000000-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*) from edit)::int, 1,
  '21. support MAY update customers'
);
reset role;

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
with attack as (
  update public.customers set notes = 'warehouse was here'
   where id = 'f0000000-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*) from attack)::int, 0,
  '22. warehouse UPDATE of customers affects zero rows'
);
reset role;

-- ---------------------------------------------------------------------------
-- G. audit_log (admin-only read), payments (admin/support read), webhooks (none)
-- ---------------------------------------------------------------------------
select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select is(
  (select count(*) from public.audit_log)::int, 0,
  '23. warehouse reads zero audit_log rows'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  (select count(*) from public.audit_log)::int, 0,
  '24. support reads zero audit_log rows'
);
select ok(
  (select count(*) from public.payments)::int >= 1,
  '25. support MAY read payments (troubleshooting)'
);
select ok(
  tests.try_write(
    $$ insert into public.payments (order_id, amount, status, idempotency_key)
       values ('a0000000-0000-0000-0000-000000000001', 1, 'pending', 'test:hack') $$
  ) like 'error:42501%',
  '26. warehouse INSERT into payments is denied (42501)'
);
reset role;

select tests.sign_in_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select ok(
  (select count(*) from public.audit_log)::int >= 1,
  '27. admin MAY read the audit log'
);
reset role;

select tests.sign_out();
select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select is(
  (select count(*) from public.webhook_events)::int, 0,
  '28. staff reads zero webhook_events rows (no policies — RLS denies all rows)'
);
reset role;
select tests.sign_out();

-- ---------------------------------------------------------------------------
-- H. Guest carts: token-gated owner access
-- ---------------------------------------------------------------------------
select tests.sign_out();
set role anon;
select set_config('app.guest_token', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select is(
  (select count(*) from public.carts)::int, 1,
  '29. guest with the cart token reads exactly their own cart'
);
select is(
  (select count(*) from public.cart_items)::int, 1,
  '30. guest with the cart token reads exactly their own cart items'
);

select set_config('app.guest_token', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select is(
  (select count(*) from public.carts)::int, 0,
  '31. guest with a different token reads zero carts'
);

select set_config('app.guest_token', '', true);
reset role;

-- ---------------------------------------------------------------------------
-- I. Role-less users, notifications, and the SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
select tests.sign_in_as('44444444-4444-4444-4444-444444444444');
set role authenticated;
select is(
  (select count(*) from public.products)::int, 1,
  '32. role-less user sees only published products (public policy)'
);
select is(
  (select count(*) from public.profiles)::int, 1,
  '33. role-less user reads exactly their own profile row'
);
reset role;
select tests.sign_out();

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select ok(
  (select count(*) from public.notifications)::int >= 1,
  '34. warehouse sees broadcast notifications'
);
select ok(
  tests.try_write(
    $$ insert into public.notifications (kind, title) values ('new_order', 'hack') $$
  ) like 'error:42501%',
  '35. staff INSERT into notifications is denied (function-only writes)'
);

-- adjust_inventory(): warehouse allowed, support denied
select is(
  (select public.adjust_inventory(
     'e0000000-0000-0000-0000-000000000001', 5, 'manual', 'TEST-36', 'top-up'
   ))::int,
  105,
  '36. warehouse MAY adjust inventory via adjust_inventory() (+5 → 105)'
);
reset role;

select tests.sign_in_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select ok(
  tests.try_write(
    $$ select public.adjust_inventory(
         'e0000000-0000-0000-0000-000000000001', 5, 'manual', 'TEST-37', 'top-up') $$
  ) like '%Only warehouse and admin staff can adjust inventory.%',
  '37. support calling adjust_inventory() is denied by the role check'
);

-- create_order_with_items(): support allowed, warehouse denied
select is(
  tests.try_write(
    $$ select public.create_order_with_items(
         'f0000000-0000-0000-0000-000000000001',
         '[{"variant_id":"e0000000-0000-0000-0000-000000000001","quantity":1}]'
       ) $$
  ),
  'ok',
  '38. support MAY create an order via create_order_with_items()'
);
reset role;

select tests.sign_in_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select ok(
  tests.try_write(
    $$ select public.create_order_with_items(
         'f0000000-0000-0000-0000-000000000001',
         '[{"variant_id":"e0000000-0000-0000-0000-000000000001","quantity":1}]'
       ) $$
  ) like '%Only admins and support staff can create orders.%',
  '39. warehouse calling create_order_with_items() is denied by the role check'
);
reset role;
select tests.sign_out();

-- ---------------------------------------------------------------------------
select * from finish();
rollback;
