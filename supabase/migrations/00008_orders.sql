-- =============================================================================
-- 00008_orders.sql — orders, line items, and the order timeline
--
--   * public.orders (order_number from the order_number_seq sequence)
--   * public.order_items (snapshots — history survives product edits)
--   * public.order_events (append-only timeline)
--   * public.discount_redemptions (FK to orders; created here, not in 00007)
--   * orders_guard_money_columns() — non-admins may touch status/tracking,
--     never money columns (bypassed by SECURITY DEFINER internals via the
--     app.money_guard_bypass setting)
--   * create_order_with_items() — the only way staff create orders
--
-- RLS: staff read; guests read their own order via the cart token; updates
-- split fulfill (admin/warehouse) vs refund-cancel (admin/support); no
-- direct INSERT/DELETE on orders.
-- =============================================================================

create sequence if not exists public.order_number_seq;

comment on sequence public.order_number_seq is
  'Backs orders.order_number: ''ORD-'' || nextval.';

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  order_number              text not null unique,
  customer_id               uuid null references public.customers (id) on delete set null,
  status                    text not null default 'pending'
                            check (status in ('pending', 'paid', 'fulfilled', 'refunded', 'cancelled', 'failed')),
  payment_status            text not null default 'pending'
                            check (payment_status in ('pending', 'paid', 'refunded', 'partially_refunded', 'void', 'failed')),
  subtotal                  numeric(12,2) not null check (subtotal >= 0),
  discount_total            numeric(12,2) not null default 0 check (discount_total >= 0),
  tax_total                 numeric(12,2) not null default 0 check (tax_total >= 0),
  shipping_total            numeric(12,2) not null default 0 check (shipping_total >= 0),
  total                     numeric(12,2) not null check (total >= 0),
  refunded_total            numeric(12,2) not null default 0
                            check (refunded_total >= 0 and refunded_total <= total),
  currency                  text not null default 'USD',
  discount_code             text null,
  shipping_address          jsonb null,
  tracking_number           text null,
  source                    text not null default 'manual',
  external_id               text null,
  guest_token               uuid null,
  stripe_checkout_session_id text null unique,
  created_by                uuid null references public.profiles (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_guest_token_idx on public.orders (guest_token) where guest_token is not null;

comment on table public.orders is
  'Orders. Money columns are admin-only via the money-guard trigger; rows are created by create_order_with_items() / create_checkout_session().';

-- ---------------------------------------------------------------------------
-- discount_redemptions: defined here (not in 00007) because of its FK to
-- public.orders, which is created above.
-- ---------------------------------------------------------------------------
create table if not exists public.discount_redemptions (
  id          uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts (id) on delete cascade,
  order_id    uuid not null references public.orders (id) on delete cascade,
  customer_id uuid null references public.customers (id) on delete set null,
  amount      numeric(12,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (discount_id, order_id)
);

create index if not exists discount_redemptions_discount_idx
  on public.discount_redemptions (discount_id);

comment on table public.discount_redemptions is
  'One row per discount use. Written only by create_order_with_items().';

-- ---------------------------------------------------------------------------
-- order_items: snapshots so order history survives product/variant edits
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  variant_id    uuid null references public.product_variants (id) on delete set null,
  product_title text not null,
  variant_title text not null,
  sku           text not null,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  line_total    numeric(12,2) not null check (line_total >= 0)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- order_events: append-only timeline per order
-- ---------------------------------------------------------------------------
create table if not exists public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  event_type text not null
             check (event_type in ('created', 'checkout_started', 'payment_succeeded', 'payment_failed', 'paid', 'fulfilled', 'refund_issued', 'cancelled', 'note_added', 'tracking_added')),
  message    text not null,
  metadata   jsonb null,
  created_by uuid null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx
  on public.order_events (order_id, created_at);

-- updated_at maintenance
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Money-column guard: non-admins may change status/tracking/shipping info,
-- never money columns. SECURITY DEFINER internals (handle_stripe_event)
-- bypass it via the app.money_guard_bypass setting, which is
-- transaction-local and set only inside those functions.
-- ---------------------------------------------------------------------------
create or replace function public.orders_guard_money_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin()
     or current_setting('app.money_guard_bypass', true) = 'on' then
    return new;
  end if;

  if new.subtotal is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.tax_total is distinct from old.tax_total
     or new.shipping_total is distinct from old.shipping_total
     or new.total is distinct from old.total
     or new.refunded_total is distinct from old.refunded_total
     or new.currency is distinct from old.currency then
    raise exception 'Only admins can change order money columns.';
  end if;

  return new;
end;
$$;

comment on function public.orders_guard_money_columns() is
  'BEFORE UPDATE guard on orders: non-admins cannot touch money columns. Refunds therefore go through SECURITY DEFINER functions.';

drop trigger if exists orders_guard_money on public.orders;
create trigger orders_guard_money
  before update on public.orders
  for each row execute function public.orders_guard_money_columns();

-- ---------------------------------------------------------------------------
-- create_order_with_items(): the only way staff create orders.
-- SECURITY DEFINER transaction: role-checked (admin/support), validates the
-- discount server-side, prices from live variant rows, decrements stock via
-- _adjust_inventory (reason 'sale'), writes order_events + notification +
-- audit_log. Raises on insufficient stock or invalid discount.
-- ---------------------------------------------------------------------------
create or replace function public.create_order_with_items(
  p_customer_id uuid,
  p_items jsonb,
  p_discount_code text default null,
  p_shipping_address jsonb default null,
  p_source text default 'manual',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role           text := public.current_role();
  v_item           jsonb;
  v_variant_id     uuid;
  v_qty            integer;
  v_price          numeric(12,2);
  v_variant_title  text;
  v_product_title  text;
  v_product_status text;
  v_sku            text;
  v_stock          integer;
  v_subtotal       numeric(12,2) := 0;
  v_discount       public.discounts%rowtype;
  v_discount_total numeric(12,2) := 0;
  v_total          numeric(12,2);
  v_order_id       uuid;
  v_order_number   text;
begin
  if v_role is distinct from 'admin' and v_role is distinct from 'support' then
    raise exception 'Only admins and support staff can create orders.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one line item.';
  end if;

  -- Validate + price every line, locking inventory rows up front so two
  -- concurrent orders cannot oversell the same variant.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_variant_id := (v_item ->> 'variant_id')::uuid;
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Each line item needs a variant_id (uuid) and a quantity (integer).';
    end;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be a positive integer.';
    end if;

    select pv.price, pv.title, pv.sku, p.title, p.status
      into v_price, v_variant_title, v_sku, v_product_title, v_product_status
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = v_variant_id;

    if not found then
      raise exception 'Variant % does not exist.', v_variant_id;
    end if;
    if v_product_status is distinct from 'published' then
      raise exception 'Product "%" is not published.', v_product_title;
    end if;

    select quantity_on_hand into v_stock
      from public.inventory_levels
     where variant_id = v_variant_id
     for update;
    if not found then
      raise exception 'No inventory record for variant %.', v_variant_id;
    end if;
    if v_stock < v_qty then
      raise exception 'Insufficient stock for % (%): have %, need %.',
        v_variant_title, v_sku, v_stock, v_qty;
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  -- Discount: validated server-side; the client never dictates the amount.
  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    v_discount := public.apply_discount_validation(p_discount_code, v_subtotal, p_customer_id);
    if v_discount.kind = 'percentage' then
      v_discount_total := round(v_subtotal * v_discount.value / 100, 2);
    else
      v_discount_total := least(v_discount.value, v_subtotal);
    end if;
  end if;

  -- Tax and shipping are computed by later phases (settings tax rate,
  -- shipping rules); Phase 2 records them as 0 so totals stay consistent.
  v_total := v_subtotal - v_discount_total;

  v_order_number := 'ORD-' || nextval('public.order_number_seq');

  insert into public.orders (
    order_number, customer_id, status, payment_status,
    subtotal, discount_total, tax_total, shipping_total, total,
    currency, discount_code, shipping_address, source, created_by
  ) values (
    v_order_number, p_customer_id, 'pending', 'pending',
    v_subtotal, v_discount_total, 0, 0, v_total,
    'USD', nullif(upper(btrim(coalesce(p_discount_code, ''))), ''),
    p_shipping_address, p_source, auth.uid()
  )
  returning id into v_order_id;

  -- Line items (snapshots) + stock decrement with 'sale' adjustments.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    select pv.price, pv.title, pv.sku, p.title
      into v_price, v_variant_title, v_sku, v_product_title
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = v_variant_id;

    insert into public.order_items (
      order_id, variant_id, product_title, variant_title, sku,
      quantity, unit_price, line_total
    ) values (
      v_order_id, v_variant_id, v_product_title, v_variant_title, v_sku,
      v_qty, v_price, v_price * v_qty
    );

    perform public._adjust_inventory(
      v_variant_id, -v_qty, 'sale', v_order_number,
      'Order ' || v_order_number, auth.uid()
    );
  end loop;

  if v_discount.id is not null then
    insert into public.discount_redemptions (discount_id, order_id, customer_id, amount)
    values (v_discount.id, v_order_id, p_customer_id, v_discount_total);
  end if;

  insert into public.order_events (order_id, event_type, message, created_by)
  values (
    v_order_id, 'created',
    'Order ' || v_order_number || ' created (' || p_source || ').',
    auth.uid()
  );

  if p_note is not null and btrim(p_note) <> '' then
    insert into public.order_events (order_id, event_type, message, created_by)
    values (v_order_id, 'note_added', p_note, auth.uid());
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  values (
    null, 'new_order',
    'New order ' || v_order_number,
    'Total $' || v_total::text || ' (' || v_subtotal::text || ' before discounts).',
    '/orders/' || v_order_number
  );

  insert into public.audit_log (actor_id, action, table_name, row_id, after)
  values (
    auth.uid(), 'order.create', 'orders', v_order_id::text,
    jsonb_build_object('order_number', v_order_number, 'total', v_total)
  );

  return v_order_id;
end;
$$;

comment on function public.create_order_with_items(uuid, jsonb, text, jsonb, text, text) is
  'Staff order creation (admin/support only): validates discount server-side, prices from live variants, decrements stock, writes timeline + notification + audit.';

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.discount_redemptions enable row level security;

-- orders: staff read; guests read only their own order via the cart token.
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read
  on public.orders for select to authenticated
  using (public.is_staff());

drop policy if exists orders_guest_own_order_read on public.orders;
create policy orders_guest_own_order_read
  on public.orders for select to anon, authenticated
  using (
    guest_token is not null
    and guest_token = public.guest_cart_token()
  );

-- No direct INSERT/DELETE on orders: creation goes through
-- create_order_with_items() / create_checkout_session(); cancellation is a
-- status change, not a delete.

-- Fulfill path: admin or warehouse may update (money columns still guarded
-- by the trigger — effectively status/tracking/shipping for non-admins).
drop policy if exists orders_fulfill_update on public.orders;
create policy orders_fulfill_update
  on public.orders for update to authenticated
  using (public.is_admin() or public.current_role() = 'warehouse')
  with check (public.is_admin() or public.current_role() = 'warehouse');

-- Refund/cancel path: admin or support may update. NOTE: the money-guard
-- trigger blocks non-admin changes to refunded_total, so Phase 4 refunds go
-- through a SECURITY DEFINER function; this policy covers status changes.
drop policy if exists orders_refund_cancel on public.orders;
create policy orders_refund_cancel
  on public.orders for update to authenticated
  using (public.is_admin() or public.current_role() = 'support')
  with check (public.is_admin() or public.current_role() = 'support');

-- order_items / order_events: staff read; guests mirror through their order.
drop policy if exists order_items_staff_read on public.order_items;
create policy order_items_staff_read
  on public.order_items for select to authenticated
  using (public.is_staff());

drop policy if exists order_items_guest_read on public.order_items;
create policy order_items_guest_read
  on public.order_items for select to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.guest_token is not null
        and o.guest_token = public.guest_cart_token()
    )
  );

drop policy if exists order_events_staff_read on public.order_events;
create policy order_events_staff_read
  on public.order_events for select to authenticated
  using (public.is_staff());

drop policy if exists order_events_guest_read on public.order_events;
create policy order_events_guest_read
  on public.order_events for select to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and o.guest_token is not null
        and o.guest_token = public.guest_cart_token()
    )
  );

-- Any staff member may add timeline notes.
drop policy if exists order_events_note_insert on public.order_events;
create policy order_events_note_insert
  on public.order_events for insert to authenticated
  with check (public.is_staff());

-- discount_redemptions: staff read; inserts only via create_order_with_items().
drop policy if exists discount_redemptions_staff_read on public.discount_redemptions;
create policy discount_redemptions_staff_read
  on public.discount_redemptions for select to authenticated
  using (public.is_staff());

-- Grants. Anon gets SELECT on orders/items/events (guest-token policies
-- filter to the caller's own order); everything else is authenticated-only,
-- narrowed further by the policies above.
grant select on public.orders to anon, authenticated;
grant select on public.order_items to anon, authenticated;
grant select on public.order_events to anon, authenticated;
grant select on public.discount_redemptions to authenticated;
grant update on public.orders to authenticated;
grant insert on public.order_events to authenticated;
