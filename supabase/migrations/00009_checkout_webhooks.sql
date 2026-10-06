-- =============================================================================
-- 00009_checkout_webhooks.sql — storefront carts, payments, Stripe webhooks
--
--   * public.carts, public.cart_items — guest-token (HttpOnly cookie) identity
--   * public.payments — one row per Stripe payment attempt; drives the order
--     state machine. NOTE: stripe_payment_intent_id is NULLABLE here, a
--     deliberate deviation from DATABASE-SCHEMA.md: create_checkout_session()
--     must insert the pending payments row *before* Stripe returns an intent.
--     The UNIQUE constraint still enforces one intent per payment.
--   * public.webhook_events — append-only inbound Stripe log; the idempotency
--     backbone (UNIQUE on stripe_event_id makes re-deliveries no-ops).
--   * create_checkout_session() — SECURITY DEFINER, cart-token-checked:
--     re-computes totals from live prices + server-validated discount.
--   * handle_stripe_event() — SECURITY DEFINER: signature-verified by the
--     route, then dispatches with forward-only guarded transitions.
--
-- RLS: carts/items are owner-only (guest token or signed-in user) + staff
-- read; payments are admin/support read; webhook_events has no policies —
-- only service_role (the webhook route) touches it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- carts / cart_items
-- ---------------------------------------------------------------------------
create table if not exists public.carts (
  id            uuid primary key default gen_random_uuid(),
  guest_token   uuid not null unique default gen_random_uuid(),
  user_id       uuid null references public.profiles (id) on delete set null,
  discount_code text null,
  expires_at    timestamptz not null default now() + interval '30 days',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.carts is
  'Guest/shopper carts, identified by the HttpOnly cookie token. guest_token rotates on checkout completion.';

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  added_at   timestamptz not null default now(),
  unique (cart_id, variant_id)
);

comment on table public.cart_items is
  'Cart lines. Prices are never stored here — totals are computed live from product_variants.price.';

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders (id) on delete cascade,
  stripe_payment_intent_id  text null unique,
  stripe_checkout_session_id text null,
  amount                    numeric(12,2) not null check (amount >= 0),
  currency                  text not null default 'USD',
  status                    text not null default 'pending'
                            check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  idempotency_key           text not null unique,
  failure_message           text null,
  raw_payload               jsonb null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);

comment on table public.payments is
  'One row per Stripe payment attempt. Drives the order state machine; transitions are forward-only.';

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- webhook_events: append-only inbound Stripe log (no FKs — survives deletes)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id                bigint primary key generated always as identity,
  stripe_event_id   text not null unique,
  event_type        text not null,
  payload           jsonb not null,
  processing_status text not null default 'received'
                    check (processing_status in ('received', 'processed', 'failed', 'skipped_duplicate')),
  error             text null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz null
);

comment on table public.webhook_events is
  'Append-only log of every inbound Stripe event. UNIQUE(stripe_event_id) is the exactly-once backbone.';

-- ---------------------------------------------------------------------------
-- create_checkout_session(p_cart_id, p_guest_token)
-- Called by /api/checkout (Phase 9). Locks the cart rows, re-computes totals
-- from live variant prices + the server-validated discount, and creates the
-- pending order + pending payments row (idempotency_key = 'order:'||order_id).
-- The client never dictates the amount. Raises on empty cart, unpublished
-- product, or insufficient stock. Stock is decremented on payment success,
-- not here.
-- ---------------------------------------------------------------------------
create or replace function public.create_checkout_session(
  p_cart_id uuid,
  p_guest_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart           public.carts%rowtype;
  v_variant_id     uuid;
  v_qty            integer;
  v_price          numeric(12,2);
  v_variant_title  text;
  v_product_title  text;
  v_product_status text;
  v_sku            text;
  v_subtotal       numeric(12,2) := 0;
  v_discount       public.discounts%rowtype;
  v_discount_total numeric(12,2) := 0;
  v_total          numeric(12,2);
  v_order_id       uuid;
  v_order_number   text;
begin
  select * into v_cart from public.carts where id = p_cart_id;
  if not found then
    raise exception 'Cart not found.';
  end if;

  -- Cart-token check: the token must match, or the cart must belong to the
  -- signed-in shopper. Same "not found" message either way (no oracle).
  if not (
    v_cart.guest_token = p_guest_token
    or (v_cart.user_id is not null and v_cart.user_id = (select auth.uid()))
  ) then
    raise exception 'Cart not found.';
  end if;

  if v_cart.expires_at < now() then
    raise exception 'This cart has expired.';
  end if;

  -- Lock the cart's lines for the duration of the checkout.
  perform 1 from public.cart_items where cart_id = p_cart_id for update;

  for v_variant_id, v_qty in
    select ci.variant_id, ci.quantity
      from public.cart_items ci
     where ci.cart_id = p_cart_id
     order by ci.added_at
  loop
    select pv.price, pv.title, pv.sku, p.title, p.status
      into v_price, v_variant_title, v_sku, v_product_title, v_product_status
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = v_variant_id;

    if not found then
      raise exception 'An item in your cart is no longer available.';
    end if;
    if v_product_status is distinct from 'published' then
      raise exception 'Product "%" is no longer available.', v_product_title;
    end if;

    -- Availability check only — the decrement happens on payment success.
    perform 1 from public.inventory_levels
     where variant_id = v_variant_id and quantity_on_hand >= v_qty;
    if not found then
      raise exception 'Insufficient stock for % (%).', v_variant_title, v_sku;
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_subtotal = 0 then
    raise exception 'Your cart is empty.';
  end if;

  -- Discount re-validated server-side at checkout time.
  if v_cart.discount_code is not null and btrim(v_cart.discount_code) <> '' then
    v_discount := public.apply_discount_validation(v_cart.discount_code, v_subtotal, null);
    if v_discount.kind = 'percentage' then
      v_discount_total := round(v_subtotal * v_discount.value / 100, 2);
    else
      v_discount_total := least(v_discount.value, v_subtotal);
    end if;
  end if;

  v_total := v_subtotal - v_discount_total;
  v_order_number := 'ORD-' || nextval('public.order_number_seq');

  insert into public.orders (
    order_number, customer_id, status, payment_status,
    subtotal, discount_total, tax_total, shipping_total, total,
    currency, discount_code, guest_token, source
  ) values (
    v_order_number, null, 'pending', 'pending',
    v_subtotal, v_discount_total, 0, 0, v_total,
    'USD', nullif(upper(btrim(coalesce(v_cart.discount_code, ''))), ''),
    p_guest_token, 'storefront'
  )
  returning id into v_order_id;

  for v_variant_id, v_qty in
    select ci.variant_id, ci.quantity
      from public.cart_items ci
     where ci.cart_id = p_cart_id
     order by ci.added_at
  loop
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
  end loop;

  insert into public.payments (
    order_id, stripe_payment_intent_id, amount, currency, status, idempotency_key
  ) values (
    v_order_id, null, v_total, 'USD', 'pending', 'order:' || v_order_id::text
  );

  if v_discount.id is not null then
    insert into public.discount_redemptions (discount_id, order_id, customer_id, amount)
    values (v_discount.id, v_order_id, null, v_discount_total);
  end if;

  insert into public.order_events (order_id, event_type, message)
  values (
    v_order_id, 'checkout_started',
    'Checkout started for ' || v_order_number || ' (storefront).'
  );

  return v_order_id;
end;
$$;

comment on function public.create_checkout_session(uuid, uuid) is
  'Storefront checkout: cart-token-checked, totals recomputed from live prices + validated discount. Returns the order id for the Stripe SDK call.';

-- ---------------------------------------------------------------------------
-- handle_stripe_event(p_event)
-- Called by /api/webhooks/stripe AFTER raw-body signature verification.
-- Contract: insert webhook_events (ON CONFLICT → skipped_duplicate, return
-- 200), dispatch on event type with forward-only guarded transitions, mark
-- processed. An unhandled exception propagates → the route returns 500 →
-- Stripe retries; the UNIQUE(stripe_event_id) guarantees exactly-once
-- effects across retries.
-- ---------------------------------------------------------------------------
create or replace function public.handle_stripe_event(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id    text := p_event ->> 'id';
  v_type        text := p_event ->> 'type';
  v_obj         jsonb := p_event -> 'data' -> 'object';
  v_webhook_id  bigint;
  v_order       public.orders%rowtype;
  v_item        record;
  v_intent_id   text;
  v_session_id  text;
  v_amount      numeric(12,2);
  v_refunded    numeric(12,2);
  v_charge_total numeric(12,2);
  v_pay_status  text;
begin
  if v_event_id is null or v_type is null then
    raise exception 'Malformed Stripe event: missing id/type.';
  end if;

  -- Idempotency first: re-deliveries become no-ops.
  insert into public.webhook_events (stripe_event_id, event_type, payload)
  values (v_event_id, v_type, p_event)
  on conflict (stripe_event_id) do nothing
  returning id into v_webhook_id;

  if not found then
    update public.webhook_events
       set processing_status = 'skipped_duplicate', processed_at = now()
     where stripe_event_id = v_event_id;
    return;
  end if;

  -- This handler (service_role, no auth.uid) must be able to move money
  -- columns; the bypass is transaction-local and set only here.
  perform set_config('app.money_guard_bypass', 'on', true);

  case v_type
    when 'checkout.session.completed', 'payment_intent.succeeded' then
      -- Locate the order: explicit metadata first, then Stripe ids.
      if (v_obj -> 'metadata' ->> 'order_id') is not null then
        begin
          select * into v_order from public.orders
           where id = (v_obj -> 'metadata' ->> 'order_id')::uuid;
        exception when invalid_text_representation then
          null; -- fall through to the Stripe-id lookups
        end;
      end if;

      if v_order.id is null and v_type = 'checkout.session.completed' then
        v_session_id := v_obj ->> 'id';
        select * into v_order from public.orders
         where stripe_checkout_session_id = v_session_id;
      end if;

      if v_order.id is null then
        v_intent_id := coalesce(v_obj ->> 'payment_intent', v_obj ->> 'id');
        select o.* into v_order
          from public.payments pay
          join public.orders o on o.id = pay.order_id
         where pay.stripe_payment_intent_id = v_intent_id;
      end if;

      if v_order.id is null then
        raise exception 'Order not found for Stripe event %.', v_event_id;
      end if;

      -- Forward-only: only a pending order can become paid. Anything else
      -- (duplicate delivery, out-of-order retry) converges without regressing.
      if v_order.status is distinct from 'pending' then
        update public.webhook_events
           set processing_status = 'processed', processed_at = now()
         where id = v_webhook_id;
        return;
      end if;

      v_intent_id := coalesce(v_obj ->> 'payment_intent', v_obj ->> 'id');
      v_amount := (coalesce(v_obj ->> 'amount_total', v_obj ->> 'amount'))::numeric / 100;

      insert into public.payments (
        order_id, stripe_payment_intent_id, stripe_checkout_session_id,
        amount, currency, status, idempotency_key, raw_payload
      ) values (
        v_order.id,
        nullif(v_intent_id, ''),
        case when v_type = 'checkout.session.completed' then v_obj ->> 'id' end,
        coalesce(v_amount, v_order.total),
        coalesce(nullif(v_obj ->> 'currency', ''), v_order.currency),
        'succeeded',
        'order:' || v_order.id::text,
        p_event
      )
      on conflict (idempotency_key) do update set
        stripe_payment_intent_id = coalesce(
          excluded.stripe_payment_intent_id, public.payments.stripe_payment_intent_id),
        stripe_checkout_session_id = coalesce(
          excluded.stripe_checkout_session_id, public.payments.stripe_checkout_session_id),
        status = 'succeeded',
        raw_payload = excluded.raw_payload,
        updated_at = now();

      update public.orders
         set status = 'paid', payment_status = 'paid', updated_at = now()
       where id = v_order.id;

      -- Stock decrement, one 'sale' adjustment per line.
      for v_item in
        select variant_id, quantity from public.order_items where order_id = v_order.id
      loop
        if v_item.variant_id is not null then
          perform public._adjust_inventory(
            v_item.variant_id, -v_item.quantity, 'sale',
            v_order.order_number, 'Order ' || v_order.order_number, null
          );
        end if;
      end loop;

      insert into public.order_events (order_id, event_type, message, metadata)
      values (
        v_order.id, 'payment_succeeded',
        'Payment succeeded for ' || v_order.order_number || '.',
        jsonb_build_object('stripe_event_id', v_event_id)
      );

      insert into public.notifications (user_id, kind, title, body, link)
      values (
        null, 'new_order',
        'New order ' || v_order.order_number,
        'Paid via Stripe. Total $' || v_order.total::text || '.',
        '/orders/' || v_order.order_number
      );

      -- Rotate the guest token so the completed cart session cannot be reused.
      if v_order.guest_token is not null then
        update public.carts
           set guest_token = gen_random_uuid(), updated_at = now()
         where guest_token = v_order.guest_token;
      end if;

      insert into public.audit_log (actor_id, action, table_name, row_id, after)
      values (
        null, 'order.paid', 'orders', v_order.id::text,
        jsonb_build_object('order_number', v_order.order_number, 'stripe_event_id', v_event_id)
      );

    when 'payment_intent.payment_failed' then
      v_intent_id := v_obj ->> 'id';

      select o.* into v_order
        from public.payments pay
        join public.orders o on o.id = pay.order_id
       where pay.stripe_payment_intent_id = v_intent_id;

      if v_order.id is null
         and (v_obj -> 'metadata' ->> 'order_id') is not null then
        begin
          select * into v_order from public.orders
           where id = (v_obj -> 'metadata' ->> 'order_id')::uuid;
        exception when invalid_text_representation then
          null;
        end;
      end if;

      if v_order.id is null then
        raise exception 'Order not found for Stripe event %.', v_event_id;
      end if;

      if v_order.status = 'pending' then
        update public.payments
           set status = 'failed',
               failure_message = coalesce(
                 v_obj -> 'last_payment_error' ->> 'message', 'Payment failed.'),
               raw_payload = p_event,
               updated_at = now()
         where order_id = v_order.id;

        update public.orders
           set status = 'failed', payment_status = 'failed', updated_at = now()
         where id = v_order.id;

        insert into public.order_events (order_id, event_type, message, metadata)
        values (
          v_order.id, 'payment_failed',
          'Payment failed for ' || v_order.order_number || '.',
          jsonb_build_object('stripe_event_id', v_event_id)
        );
      end if;

    when 'charge.refunded' then
      v_intent_id := v_obj ->> 'payment_intent';

      select o.* into v_order
        from public.payments pay
        join public.orders o on o.id = pay.order_id
       where pay.stripe_payment_intent_id = v_intent_id;

      if v_order.id is null then
        raise exception 'Order not found for Stripe event %.', v_event_id;
      end if;

      -- Forward-only: refunds apply to paid/fulfilled orders.
      if v_order.status in ('paid', 'fulfilled') then
        v_refunded := (v_obj ->> 'amount_refunded')::numeric / 100;
        v_charge_total := (v_obj ->> 'amount')::numeric / 100;
        v_pay_status := case
          when v_refunded >= v_charge_total then 'refunded'
          else 'partially_refunded'
        end;

        update public.payments
           set status = v_pay_status, raw_payload = p_event, updated_at = now()
         where stripe_payment_intent_id = v_intent_id;

        update public.orders
           set status = 'refunded',
               refunded_total = v_refunded,
               updated_at = now()
         where id = v_order.id;

        insert into public.order_events (order_id, event_type, message, metadata)
        values (
          v_order.id, 'refund_issued',
          'Refund issued for ' || v_order.order_number || ' ($' || v_refunded::text || ').',
          jsonb_build_object('stripe_event_id', v_event_id)
        );

        insert into public.notifications (user_id, kind, title, body, link)
        values (
          null, 'refund_issued',
          'Refund issued: ' || v_order.order_number,
          '$' || v_refunded::text || ' refunded via Stripe.',
          '/orders/' || v_order.order_number
        );

        insert into public.audit_log (actor_id, action, table_name, row_id, after)
        values (
          null, 'order.refund', 'orders', v_order.id::text,
          jsonb_build_object(
            'order_number', v_order.order_number,
            'refunded_total', v_refunded,
            'stripe_event_id', v_event_id
          )
        );
      end if;

    else
      -- Unknown event type: recorded above, nothing to dispatch.
      null;
  end case;

  update public.webhook_events
     set processing_status = 'processed', processed_at = now()
   where id = v_webhook_id;
end;
$$;

comment on function public.handle_stripe_event(jsonb) is
  'Stripe webhook dispatcher (SECURITY DEFINER). Idempotent via webhook_events; forward-only state transitions; stock decrement + notification on success.';

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;

-- carts / cart_items: owner-only via guest token or signed-in user.
drop policy if exists carts_owner_read on public.carts;
create policy carts_owner_read
  on public.carts for select to anon, authenticated
  using (
    guest_token = public.guest_cart_token()
    or (user_id is not null and user_id = (select auth.uid()))
  );

drop policy if exists carts_owner_write on public.carts;
create policy carts_owner_write
  on public.carts for insert to anon, authenticated
  with check (
    guest_token = public.guest_cart_token()
    or (user_id is not null and user_id = (select auth.uid()))
  );

drop policy if exists carts_owner_update on public.carts;
create policy carts_owner_update
  on public.carts for update to anon, authenticated
  using (
    guest_token = public.guest_cart_token()
    or (user_id is not null and user_id = (select auth.uid()))
  )
  with check (
    guest_token = public.guest_cart_token()
    or (user_id is not null and user_id = (select auth.uid()))
  );

drop policy if exists carts_owner_delete on public.carts;
create policy carts_owner_delete
  on public.carts for delete to anon, authenticated
  using (
    guest_token = public.guest_cart_token()
    or (user_id is not null and user_id = (select auth.uid()))
  );

-- Staff read all carts for support (order lookup).
drop policy if exists carts_staff_read on public.carts;
create policy carts_staff_read
  on public.carts for select to authenticated
  using (public.is_staff());

drop policy if exists cart_items_owner_read on public.cart_items;
create policy cart_items_owner_read
  on public.cart_items for select to anon, authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (c.guest_token = public.guest_cart_token()
             or (c.user_id is not null and c.user_id = (select auth.uid())))
    )
  );

drop policy if exists cart_items_owner_write on public.cart_items;
create policy cart_items_owner_write
  on public.cart_items for all to anon, authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (c.guest_token = public.guest_cart_token()
             or (c.user_id is not null and c.user_id = (select auth.uid())))
    )
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (c.guest_token = public.guest_cart_token()
             or (c.user_id is not null and c.user_id = (select auth.uid())))
    )
  );

drop policy if exists cart_items_staff_read on public.cart_items;
create policy cart_items_staff_read
  on public.cart_items for select to authenticated
  using (public.is_staff());

-- payments: admin and support read (payment troubleshooting). No direct
-- writes — rows are created/updated only by create_checkout_session() and
-- handle_stripe_event() (SECURITY DEFINER).
drop policy if exists payments_admin_support_read on public.payments;
create policy payments_admin_support_read
  on public.payments for select to authenticated
  using (public.is_admin() or public.current_role() = 'support');

-- webhook_events: no policies on purpose. The webhook route runs as
-- service_role and the handler is SECURITY DEFINER; app code never reads
-- the table directly (ops use the SQL editor or a future admin screen).
-- A bare SELECT grant keeps the denial graceful (0 rows via RLS) instead of
-- a permission error; with zero policies no app role can see any row.
grant select on public.webhook_events to authenticated;

grant select, insert, update, delete on public.carts to anon, authenticated;
grant select, insert, update, delete on public.cart_items to anon, authenticated;
grant select on public.payments to authenticated;
