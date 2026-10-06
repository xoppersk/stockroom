-- =============================================================================
-- seed.sql — Juniper Supply Co. demo store
--
-- 4 categories, 12 products (22 variants, 24 images), 20 customers with
-- addresses, 40 orders across all six statuses, 3 discount codes with
-- redemptions, and staff notifications. Every list screen later phases build
-- has data on first load.
--
-- Run: `supabase db reset` (applies migrations, then this seed).
-- The seed runs with elevated privileges (table owner), so RLS does not
-- apply; triggers (updated_at, inventory auto-create, code normalization)
-- fire normally. Idempotent: re-running is a no-op once seed orders exist.
-- =============================================================================

do $$
declare
  -- categories
  c_kitchen uuid; c_textiles uuid; c_lighting uuid; c_decor uuid;
  -- products
  p_mug uuid; p_board uuid; p_skillet uuid; p_carafe uuid;
  p_pillow uuid; p_throw uuid; p_duvet uuid; p_rug uuid;
  p_lamp uuid; p_vase uuid; p_tray uuid; p_candle uuid;
  -- sellable variants (published products only)
  v_ids uuid[];
  -- discounts
  d_welcome uuid;
  -- customers
  cust_ids uuid[] := '{}';
  firsts text[] := array[
    'Amara','James','Fatima','Michael','Isata','David','Mariama','Sarah',
    'Abdul','Grace','Mohamed','Hawa','Ibrahim','Zainab','Samuel','Kadiatu',
    'Emmanuel','Aisha','Daniel','Aminata'];
  lasts text[] := array[
    'Koroma','Sesay','Kamara','Conteh','Bangura','Turay','Jalloh','Bah',
    'Sow','Dumbuya','Fofanah','Kargbo','Mansaray','Kanu','Coker','Davies',
    'Williams','Johnson','Cole','Lewis'];
  -- order loop
  i int; j int; k int;
  v_cust uuid;
  v_status text;
  v_pay_status text;
  v_order_id uuid;
  v_order_number text;
  v_nitems int;
  v_var uuid;
  v_qty int;
  v_price numeric(12,2);
  v_vtitle text;
  v_ptitle text;
  v_sku text;
  v_subtotal numeric(12,2);
  v_disc numeric(12,2);
  v_dcode text;
  v_ship numeric(12,2);
  v_total numeric(12,2);
  v_source text;
  v_guest uuid;
  v_var_ids uuid[];
  v_qtys int[];
  v_before int;
begin
  if exists (select 1 from public.orders where source = 'seed') then
    raise notice 'Seed already applied — skipping.';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Categories
  -- -------------------------------------------------------------------------
  insert into public.categories (name, slug) values
    ('Kitchen & Dining', 'kitchen-dining'),
    ('Home Textiles', 'home-textiles'),
    ('Lighting', 'lighting'),
    ('Decor', 'decor')
  on conflict (slug) do nothing;

  select id into c_kitchen  from public.categories where slug = 'kitchen-dining';
  select id into c_textiles from public.categories where slug = 'home-textiles';
  select id into c_lighting from public.categories where slug = 'lighting';
  select id into c_decor    from public.categories where slug = 'decor';

  -- -------------------------------------------------------------------------
  -- Products (Juniper Supply Co. home & lifestyle goods)
  -- -------------------------------------------------------------------------
  insert into public.products (title, slug, description, category_id, tags, status) values
    ('Stoneware Mug — Set of 4', 'stoneware-mug-set',
     'Hand-finished stoneware mugs with a matte glaze. Each holds 12 oz — the everyday mug for slow mornings.',
     c_kitchen, array['mug','stoneware','drinkware'], 'published'),
    ('Oak Cutting Board', 'oak-cutting-board',
     'Solid white oak with a juice groove and food-safe oil finish. Built for daily prep, handsome enough to serve on.',
     c_kitchen, array['board','oak','prep'], 'published'),
    ('Cast Iron Skillet — 10 in', 'cast-iron-skillet-10',
     'Pre-seasoned cast iron with a pour spout on each side. Sears, bakes, and goes from stovetop to oven.',
     c_kitchen, array['skillet','cast-iron','cookware'], 'published'),
    ('Glass Carafe Set', 'glass-carafe-set',
     'A 1L mouth-blown glass carafe with two matching tumblers. For water, juice, or the bedside table.',
     c_kitchen, array['carafe','glass','drinkware'], 'published'),
    ('Linen Throw Pillow', 'linen-throw-pillow',
     'Stonewashed European flax with a hidden zip. Cover only, 18×18 in.',
     c_textiles, array['pillow','linen','decor'], 'published'),
    ('Wool Throw Blanket', 'wool-throw-blanket',
     'Undyed lambswool woven in a classic twill. Warm without weight, 50×60 in.',
     c_textiles, array['throw','wool','blanket'], 'published'),
    ('Cotton Duvet Set', 'cotton-duvet-set',
     'Percale-weave long-staple cotton: duvet cover plus two pillow shams. Gets softer with every wash.',
     c_textiles, array['duvet','cotton','bedding'], 'published'),
    ('Jute Area Rug', 'jute-area-rug',
     'Hand-braided jute with a cotton backing. Natural texture that grounds a room.',
     c_textiles, array['rug','jute','floor'], 'draft'),
    ('Brass Table Lamp', 'brass-table-lamp',
     'Brushed brass stem, linen drum shade, inline dimmer. A warm pool of light for the side table.',
     c_lighting, array['lamp','brass','lighting'], 'published'),
    ('Ceramic Vase', 'ceramic-vase',
     'Wheel-thrown stoneware vase in a chalky matte glaze. Beautiful empty, better with stems.',
     c_decor, array['vase','ceramic','decor'], 'archived'),
    ('Walnut Serving Tray', 'walnut-serving-tray',
     'Black walnut tray with hand-cut handles. For coffee service, catch-alls, or the ottoman.',
     c_decor, array['tray','walnut','serveware'], 'published'),
    ('Beeswax Candle Trio', 'beeswax-candle-trio',
     'Three hand-poured beeswax pillars with cotton wicks. Honey-scented, 20-hour burn each.',
     c_decor, array['candle','beeswax','home'], 'published')
  on conflict (slug) do nothing;

  select id into p_mug     from public.products where slug = 'stoneware-mug-set';
  select id into p_board   from public.products where slug = 'oak-cutting-board';
  select id into p_skillet from public.products where slug = 'cast-iron-skillet-10';
  select id into p_carafe  from public.products where slug = 'glass-carafe-set';
  select id into p_pillow  from public.products where slug = 'linen-throw-pillow';
  select id into p_throw   from public.products where slug = 'wool-throw-blanket';
  select id into p_duvet   from public.products where slug = 'cotton-duvet-set';
  select id into p_rug     from public.products where slug = 'jute-area-rug';
  select id into p_lamp    from public.products where slug = 'brass-table-lamp';
  select id into p_vase    from public.products where slug = 'ceramic-vase';
  select id into p_tray    from public.products where slug = 'walnut-serving-tray';
  select id into p_candle  from public.products where slug = 'beeswax-candle-trio';

  -- -------------------------------------------------------------------------
  -- Variants (22)
  -- -------------------------------------------------------------------------
  insert into public.product_variants
    (product_id, title, sku, option_values, price, compare_at_price, position)
  values
    (p_mug, 'Terracotta / Standard', 'JSP-MUG-TER-S', '{"Color":"Terracotta","Size":"Standard"}', 34.00, 42.00, 0),
    (p_mug, 'Terracotta / Large',    'JSP-MUG-TER-L', '{"Color":"Terracotta","Size":"Large"}',    38.00, null,  1),
    (p_mug, 'Oat / Standard',        'JSP-MUG-OAT-S', '{"Color":"Oat","Size":"Standard"}',        34.00, 42.00, 2),
    (p_mug, 'Oat / Large',           'JSP-MUG-OAT-L', '{"Color":"Oat","Size":"Large"}',           38.00, null,  3),
    (p_board, 'Small', 'JSP-BRD-OAK-S', '{"Size":"Small"}', 28.00, null, 0),
    (p_board, 'Large', 'JSP-BRD-OAK-L', '{"Size":"Large"}', 46.00, 58.00, 1),
    (p_skillet, '10 inch', 'JSP-SKL-CI-10', '{"Size":"10 in"}', 58.00, null, 0),
    (p_carafe, 'Set of 3', 'JSP-CRF-GLS-SET', '{"Set":"Carafe + 2 tumblers"}', 32.00, null, 0),
    (p_pillow, 'Natural',  'JSP-PLW-LIN-NAT', '{"Color":"Natural"}',  24.00, null, 0),
    (p_pillow, 'Charcoal', 'JSP-PLW-LIN-CHA', '{"Color":"Charcoal"}', 24.00, null, 1),
    (p_pillow, 'Sage',     'JSP-PLW-LIN-SAG', '{"Color":"Sage"}',     26.00, null, 2),
    (p_throw, 'Oat',  'JSP-THR-WOL-OAT', '{"Color":"Oat"}',  88.00, 110.00, 0),
    (p_throw, 'Rust', 'JSP-THR-WOL-RST', '{"Color":"Rust"}', 88.00, null, 1),
    (p_duvet, 'Queen', 'JSP-DUV-COT-Q', '{"Size":"Queen"}', 120.00, null, 0),
    (p_duvet, 'King',  'JSP-DUV-COT-K', '{"Size":"King"}',  140.00, 165.00, 1),
    (p_rug, '4 x 6 ft', 'JSP-RUG-JUT-46', '{"Size":"4x6 ft"}', 110.00, null, 0),
    (p_rug, '5 x 8 ft', 'JSP-RUG-JUT-58', '{"Size":"5x8 ft"}', 160.00, null, 1),
    (p_lamp, '18 in', 'JSP-LMP-BRS-18', '{"Height":"18 in"}', 96.00, 120.00, 0),
    (p_vase, 'Small', 'JSP-VAS-CER-S', '{"Size":"Small"}', 26.00, null, 0),
    (p_vase, 'Large', 'JSP-VAS-CER-L', '{"Size":"Large"}', 44.00, null, 1),
    (p_tray, '18 in', 'JSP-TRY-WAL-18', '{"Length":"18 in"}', 52.00, null, 0),
    (p_candle, 'Set of 3', 'JSP-CND-BWX-TRIO', '{"Set":"3 pillars"}', 30.00, 36.00, 0)
  on conflict (sku) do nothing;

  -- Sellable pool: variants of published products only.
  select array_agg(pv.id order by pv.sku) into v_ids
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
   where p.status = 'published';

  -- -------------------------------------------------------------------------
  -- Images (2 per product; storage_path points into the product-images bucket)
  -- -------------------------------------------------------------------------
  delete from public.product_images
   where product_id in (select id from public.products
                        where slug in ('stoneware-mug-set','oak-cutting-board','cast-iron-skillet-10',
                                       'glass-carafe-set','linen-throw-pillow','wool-throw-blanket',
                                       'cotton-duvet-set','jute-area-rug','brass-table-lamp',
                                       'ceramic-vase','walnut-serving-tray','beeswax-candle-trio'));

  insert into public.product_images (product_id, storage_path, alt_text, position)
  select pid, pid::text || '/gallery/' || n || '.jpg', title || ' — photo ' || n, n - 1
    from (values
      (p_mug, 'Stoneware Mug Set'), (p_board, 'Oak Cutting Board'),
      (p_skillet, 'Cast Iron Skillet'), (p_carafe, 'Glass Carafe Set'),
      (p_pillow, 'Linen Throw Pillow'), (p_throw, 'Wool Throw Blanket'),
      (p_duvet, 'Cotton Duvet Set'), (p_rug, 'Jute Area Rug'),
      (p_lamp, 'Brass Table Lamp'), (p_vase, 'Ceramic Vase'),
      (p_tray, 'Walnut Serving Tray'), (p_candle, 'Beeswax Candle Trio')
    ) as t(pid, title)
  cross join generate_series(1, 2) as n;

  -- -------------------------------------------------------------------------
  -- Inventory: deterministic opening quantities for sellable variants, then
  -- two low-stock cases for the low-stock panel.
  -- -------------------------------------------------------------------------
  update public.inventory_levels il
     set quantity_on_hand = 40 + (abs(hashtext(pv.sku)) % 120),
         low_stock_threshold = 10
    from public.product_variants pv
   where pv.id = il.variant_id
     and pv.id = any (v_ids);

  -- -------------------------------------------------------------------------
  -- Customers (20) + one default shipping address each
  -- -------------------------------------------------------------------------
  for i in 1..20 loop
    insert into public.customers (first_name, last_name, email, phone, tags, notes)
    values (
      firsts[i], lasts[i],
      lower(firsts[i] || '.' || lasts[i]) || '@example.com',
      '+1 215-555-01' || lpad(i::text, 2, '0'),
      case when i % 7 = 0 then array['vip'] when i % 9 = 0 then array['wholesale'] else '{}' end,
      case when i % 6 = 0 then 'Prefers delivery after 5pm.' else '' end
    )
    returning id into v_cust;

    cust_ids := cust_ids || v_cust;

    insert into public.customer_addresses
      (customer_id, label, line1, city, region, postal_code, country, is_default)
    values (
      v_cust, 'shipping',
      (100 + i * 7) || ' Walnut St', 'Philadelphia', 'PA',
      '1910' || (i % 10), 'US', true
    );
  end loop;

  -- -------------------------------------------------------------------------
  -- Discounts (3): two active, one expired
  -- -------------------------------------------------------------------------
  insert into public.discounts
    (code, kind, value, usage_limit, per_customer_limit, min_order_value, starts_at, ends_at, status)
  values
    ('WELCOME10', 'percentage', 10, null, 1, 0,
     now() - interval '60 days', null, 'active'),
    ('JUNIPER20', 'percentage', 20, 100, 1, 75,
     now() - interval '10 days', now() + interval '20 days', 'active'),
    ('SPRING15', 'percentage', 15, null, null, 0,
     now() - interval '120 days', now() - interval '30 days', 'active')
  on conflict (code) do nothing;

  select id into d_welcome from public.discounts where code = 'WELCOME10';

  -- -------------------------------------------------------------------------
  -- Orders (40) across all six statuses, spread over the last 40 days
  -- -------------------------------------------------------------------------
  for i in 1..40 loop
    v_cust := cust_ids[((i - 1) % 20) + 1];
    v_status := case
      when i % 10 = 0 then 'cancelled'
      when i % 10 = 9 then 'refunded'
      when i % 8 = 7 then 'pending'
      when i % 12 = 11 then 'failed'
      when i % 2 = 0 then 'paid'
      else 'fulfilled'
    end;
    v_pay_status := case v_status
      when 'paid' then 'paid'
      when 'fulfilled' then 'paid'
      when 'refunded' then 'refunded'
      when 'failed' then 'failed'
      when 'cancelled' then 'void'
      else 'pending'
    end;

    -- pick 1–3 deterministic line items
    v_nitems := 1 + (i % 3);
    v_var_ids := '{}';
    v_qtys := '{}';
    v_subtotal := 0;
    for j in 1..v_nitems loop
      v_var := v_ids[(((i * 7 + j * 13) % array_length(v_ids, 1)) + 1)];
      v_qty := 1 + ((i + j) % 3);
      select price into v_price from public.product_variants where id = v_var;
      v_subtotal := v_subtotal + v_price * v_qty;
      v_var_ids := v_var_ids || v_var;
      v_qtys := v_qtys || v_qty;
    end loop;

    -- every 4th sellable order uses WELCOME10
    v_disc := 0;
    v_dcode := null;
    if i % 4 = 1 and v_status in ('paid', 'fulfilled', 'refunded') then
      v_disc := round(v_subtotal * 0.10, 2);
      v_dcode := 'WELCOME10';
    end if;

    v_ship := case when i % 4 = 0 then 6.95 else 0 end;
    v_total := v_subtotal - v_disc + v_ship;
    v_order_number := 'ORD-' || nextval('public.order_number_seq');
    -- a few storefront orders (guest checkout) for the source badge + guest read path
    v_source := case when i in (5, 15, 25) then 'storefront' else 'seed' end;
    v_guest := case when i in (5, 15, 25) then gen_random_uuid() else null end;

    insert into public.orders (
      order_number, customer_id, status, payment_status,
      subtotal, discount_total, tax_total, shipping_total, total,
      refunded_total, currency, discount_code,
      shipping_address, source, guest_token, created_at
    ) values (
      v_order_number, v_cust, v_status, v_pay_status,
      v_subtotal, v_disc, 0, v_ship, v_total,
      case when v_status = 'refunded' then v_total else 0 end,
      'USD', v_dcode,
      case when i % 3 = 0 then
        jsonb_build_object('line1', (100 + i * 7) || ' Walnut St',
                           'city', 'Philadelphia', 'region', 'PA',
                           'postal_code', '1910' || (i % 10), 'country', 'US')
      end,
      v_source, v_guest,
      now() - ((40 - i) || ' days')::interval
    )
    returning id into v_order_id;

    -- line items (+ stock movement for orders that took stock)
    for k in 1..array_length(v_var_ids, 1) loop
      v_var := v_var_ids[k];
      v_qty := v_qtys[k];
      select pv.price, pv.title, pv.sku, p.title
        into v_price, v_vtitle, v_sku, v_ptitle
        from public.product_variants pv
        join public.products p on p.id = pv.product_id
       where pv.id = v_var;

      insert into public.order_items
        (order_id, variant_id, product_title, variant_title, sku, quantity, unit_price, line_total)
      values
        (v_order_id, v_var, v_ptitle, v_vtitle, v_sku, v_qty, v_price, v_price * v_qty);

      if v_status in ('paid', 'fulfilled', 'refunded') then
        select quantity_on_hand into v_before
          from public.inventory_levels where variant_id = v_var;
        update public.inventory_levels
           set quantity_on_hand = quantity_on_hand - v_qty
         where variant_id = v_var;
        insert into public.inventory_adjustments
          (variant_id, delta, quantity_before, quantity_after, reason, reference)
        values
          (v_var, -v_qty, v_before, v_before - v_qty, 'sale', v_order_number);
      end if;
    end loop;

    if v_dcode is not null then
      insert into public.discount_redemptions (discount_id, order_id, customer_id, amount)
      values (d_welcome, v_order_id, v_cust, v_disc);
    end if;

    -- timeline
    insert into public.order_events (order_id, event_type, message, created_at)
    values (v_order_id, 'created',
            'Order ' || v_order_number || ' created (seed).',
            now() - ((40 - i) || ' days')::interval);

    if v_status in ('paid', 'fulfilled', 'refunded') then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'payment_succeeded',
              'Payment succeeded for ' || v_order_number || '.'),
             (v_order_id, 'paid',
              'Order ' || v_order_number || ' marked paid.');
    end if;
    if v_status = 'fulfilled' then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'fulfilled',
              'Order ' || v_order_number || ' fulfilled. Tracking 1Z' || lpad(i::text, 6, '0') || '.');
    end if;
    if v_status = 'refunded' then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'refund_issued',
              'Refund issued for ' || v_order_number || ' ($' || v_total::text || ').');
    end if;
    if v_status = 'cancelled' then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'cancelled',
              'Order ' || v_order_number || ' cancelled before payment.');
    end if;
    if v_status = 'failed' then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'payment_failed',
              'Payment failed for ' || v_order_number || '.');
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Low-stock end states for the low-stock panel (after all seed sales):
  -- Oat / Standard mug is low, the candle trio is out.
  -- -------------------------------------------------------------------------
  select quantity_on_hand into v_before
    from public.inventory_levels
   where variant_id = (select id from public.product_variants where sku = 'JSP-MUG-OAT-S');
  update public.inventory_levels set quantity_on_hand = 3
   where variant_id = (select id from public.product_variants where sku = 'JSP-MUG-OAT-S');
  if (3 - v_before) <> 0 then
    insert into public.inventory_adjustments
      (variant_id, delta, quantity_before, quantity_after, reason, reference, note)
    values
      ((select id from public.product_variants where sku = 'JSP-MUG-OAT-S'),
       3 - v_before, v_before, 3, 'recount', 'SEED', 'Seed: low-stock demo case');
  end if;

  select quantity_on_hand into v_before
    from public.inventory_levels
   where variant_id = (select id from public.product_variants where sku = 'JSP-CND-BWX-TRIO');
  update public.inventory_levels set quantity_on_hand = 0
   where variant_id = (select id from public.product_variants where sku = 'JSP-CND-BWX-TRIO');
  if v_before <> 0 then
    insert into public.inventory_adjustments
      (variant_id, delta, quantity_before, quantity_after, reason, reference, note)
    values
      ((select id from public.product_variants where sku = 'JSP-CND-BWX-TRIO'),
       -v_before, v_before, 0, 'recount', 'SEED', 'Seed: low-stock demo case');
  end if;

  -- -------------------------------------------------------------------------
  -- Notifications
  -- -------------------------------------------------------------------------
  insert into public.notifications (user_id, kind, title, body, link)
  values
    (null, 'new_order', 'New order ORD-3',
     'Paid via Stripe. Total in timeline.', '/orders/ORD-3'),
    (null, 'new_order', 'New order ORD-5',
     'Paid via Stripe. Total in timeline.', '/orders/ORD-5'),
    (null, 'low_stock', 'Low stock: Oat / Standard',
     '3 units on hand (threshold 10).', '/inventory?alert=low'),
    (null, 'low_stock', 'Low stock: Set of 3',
     '0 units on hand (threshold 10).', '/inventory?alert=low'),
    (null, 'refund_issued', 'Refund issued: ORD-9',
     'Refund processed via Stripe.', '/orders/ORD-9');

  raise notice 'Seed complete: Juniper Supply Co. demo data loaded.';
end $$;
