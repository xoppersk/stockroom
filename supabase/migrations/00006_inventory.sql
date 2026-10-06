-- =============================================================================
-- 00006_inventory.sql — stock levels and the append-only adjustment log
--
--   * public.inventory_levels      — single stock pool per variant
--   * public.inventory_adjustments — append-only log of every stock change
--   * _adjust_inventory()          — internal worker (no role check)
--   * adjust_inventory()           — public entry: role-checked, wraps the worker
--
-- RLS: staff read both tables. There are deliberately NO direct write
-- policies — every write goes through adjust_inventory() (SECURITY DEFINER),
-- which re-checks the caller's role.
-- =============================================================================

create table if not exists public.inventory_levels (
  variant_id          uuid primary key references public.product_variants (id) on delete cascade,
  quantity_on_hand    integer not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  updated_at          timestamptz not null default now()
);

comment on table public.inventory_levels is 'Single stock pool per variant. Write only via adjust_inventory().';

create table if not exists public.inventory_adjustments (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references public.product_variants (id) on delete cascade,
  delta           integer not null check (delta <> 0),
  quantity_before integer not null,
  quantity_after  integer not null,
  reason          text not null
                  check (reason in ('sale', 'restock_received', 'damaged', 'recount', 'return', 'cancelled_order', 'manual')),
  reference       text null,
  note            text null,
  created_by      uuid null references public.profiles (id),
  created_at      timestamptz not null default now()
);

create index if not exists inventory_adjustments_variant_idx
  on public.inventory_adjustments (variant_id, created_at desc);

comment on table public.inventory_adjustments is
  'Append-only log of every stock change. Written only by adjust_inventory().';

-- Every variant gets a stock pool the moment it is created.
create or replace function public.create_inventory_level_for_variant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory_levels (variant_id)
  values (new.id)
  on conflict (variant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists product_variants_create_inventory on public.product_variants;
create trigger product_variants_create_inventory
  after insert on public.product_variants
  for each row execute function public.create_inventory_level_for_variant();

-- updated_at maintenance
drop trigger if exists inventory_levels_set_updated_at on public.inventory_levels;
create trigger inventory_levels_set_updated_at
  before update on public.inventory_levels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- _adjust_inventory(): the internal worker. Called by adjust_inventory(),
-- create_order_with_items(), and handle_stripe_event(). No role check here —
-- callers (or their wrappers) own authorization.
-- ---------------------------------------------------------------------------
create or replace function public._adjust_inventory(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text default null,
  p_note text default null,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before    integer;
  v_after     integer;
  v_threshold integer;
  v_actor     uuid := coalesce(p_actor, auth.uid());
begin
  if p_delta = 0 then
    raise exception 'Inventory delta must not be zero.';
  end if;

  select quantity_on_hand, low_stock_threshold
    into v_before, v_threshold
    from public.inventory_levels
   where variant_id = p_variant_id
   for update;

  if not found then
    raise exception 'No inventory record for variant %.', p_variant_id;
  end if;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'Insufficient stock: have %, cannot apply delta %.', v_before, p_delta;
  end if;

  update public.inventory_levels
     set quantity_on_hand = v_after,
         updated_at = now()
   where variant_id = p_variant_id;

  insert into public.inventory_adjustments
    (variant_id, delta, quantity_before, quantity_after, reason, reference, note, created_by)
  values
    (p_variant_id, p_delta, v_before, v_after, p_reason, p_reference, p_note, v_actor);

  -- Crossing below threshold fires a low-stock broadcast notification.
  if v_after < v_threshold and v_before >= v_threshold then
    insert into public.notifications (user_id, kind, title, body, link)
    select
      null,
      'low_stock',
      'Low stock: ' || v.title,
      v_before || ' → ' || v_after || ' units on hand (threshold ' || v_threshold || ').',
      '/inventory?alert=low'
    from public.product_variants v
    where v.id = p_variant_id;
  end if;

  insert into public.audit_log (actor_id, action, table_name, row_id, before, after)
  values (
    v_actor,
    'inventory.adjust',
    'inventory_levels',
    p_variant_id::text,
    jsonb_build_object('quantity_on_hand', v_before),
    jsonb_build_object('quantity_on_hand', v_after)
  );

  return v_after;
end;
$$;

comment on function public._adjust_inventory(uuid, integer, text, text, text, uuid) is
  'Internal stock-move worker. No role check — callers own authorization.';

-- ---------------------------------------------------------------------------
-- adjust_inventory(): the public entry point. Re-checks the caller''s role:
-- warehouse and admin staff may move stock; support may not.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.current_role() = 'warehouse') then
    raise exception 'Only warehouse and admin staff can adjust inventory.';
  end if;

  return public._adjust_inventory(
    p_variant_id, p_delta, p_reason, p_reference, p_note, auth.uid()
  );
end;
$$;

comment on function public.adjust_inventory(uuid, integer, text, text, text) is
  'Role-checked stock adjustment: validates the move, logs it, fires low-stock notifications, writes audit_log.';

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.inventory_levels enable row level security;
alter table public.inventory_adjustments enable row level security;

drop policy if exists inventory_levels_staff_read on public.inventory_levels;
create policy inventory_levels_staff_read
  on public.inventory_levels for select to authenticated
  using (public.is_staff());

drop policy if exists inventory_adjustments_staff_read on public.inventory_adjustments;
create policy inventory_adjustments_staff_read
  on public.inventory_adjustments for select to authenticated
  using (public.is_staff());

-- No INSERT/UPDATE/DELETE policies on purpose: all writes run inside
-- adjust_inventory(), which is SECURITY DEFINER and bypasses RLS.

grant select on public.inventory_levels to authenticated;
grant select on public.inventory_adjustments to authenticated;
