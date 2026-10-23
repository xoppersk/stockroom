-- =============================================================================
-- 00012_console.sql — admin-console rewire support
--
-- PARENT DASHBOARD APPLY — not yet live. Paste into the Supabase SQL
-- editor for project splcmpqzhraiixsnyosa and run once. Idempotent:
-- safe to re-run (add-column-if-not-exists, create-table-if-not-exists,
-- drop-policy-if-exists, on-conflict-do-nothing grants).
--
--   * public.orders.fulfillment_stage — the console's pick/pack/ship
--     stage, separate from the money/status lifecycle. Backfilled from
--     status for existing rows.
--   * public.product_variants.shelf / cost_price — warehouse location
--     and unit cost, drawn in the console but with no DB home until now.
--   * public.purchase_orders + purchase_order_lines — inbound stock.
--     Staff read; admin/warehouse write (RLS via public.is_staff() /
--     public.current_role()).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- orders.fulfillment_stage
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists fulfillment_stage text null;

-- The check is added separately so a re-run does not fail on the
-- duplicate constraint, and so pre-existing values are validated once.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_fulfillment_stage_check'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_stage_check
      check (fulfillment_stage in ('to-pick', 'packing', 'ready', 'shipped', 'delivered'));
  end if;
end $$;

comment on column public.orders.fulfillment_stage is
  'Console fulfillment stage (00012). NULL = derive from status: paid → to-pick, fulfilled → shipped, pending → held.';

-- Backfill from status (only rows not yet staged).
update public.orders
   set fulfillment_stage = case status
     when 'fulfilled' then 'shipped'
     when 'paid' then 'to-pick'
     else fulfillment_stage
   end
 where fulfillment_stage is null
   and status in ('fulfilled', 'paid');

-- ---------------------------------------------------------------------------
-- product_variants.shelf / cost_price
-- ---------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists shelf text null;

alter table public.product_variants
  add column if not exists cost_price numeric(12,2) null;

comment on column public.product_variants.shelf is
  'Warehouse shelf location (00012), e.g. ''B-14''. Display + pick lists only.';
comment on column public.product_variants.cost_price is
  'Unit cost (00012). Staff-only: the anon column grants on product_variants do not include it.';

-- ---------------------------------------------------------------------------
-- purchase_orders + purchase_order_lines
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id         text primary key,
  supplier   text not null,
  eta        date null,
  status     text not null default 'open'
             check (status in ('open', 'received', 'cancelled')),
  created_by uuid null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.purchase_orders is
  'Inbound purchase orders (00012). Receiving moves stock via adjust_inventory() and flips status to received.';

create table if not exists public.purchase_order_lines (
  id         uuid primary key default gen_random_uuid(),
  po_id      text not null references public.purchase_orders (id) on delete cascade,
  variant_id uuid null references public.product_variants (id) on delete set null,
  sku        text not null,
  qty        integer not null check (qty > 0)
);

create index if not exists purchase_order_lines_po_idx
  on public.purchase_order_lines (po_id);

comment on table public.purchase_order_lines is
  'Lines of a purchase order (00012). sku is the snapshot key; variant_id links the live variant when known.';

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: staff read; admin/warehouse write.
-- ---------------------------------------------------------------------------
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

drop policy if exists purchase_orders_staff_read on public.purchase_orders;
create policy purchase_orders_staff_read
  on public.purchase_orders for select to authenticated
  using (public.is_staff());

drop policy if exists purchase_orders_admin_warehouse_write on public.purchase_orders;
create policy purchase_orders_admin_warehouse_write
  on public.purchase_orders for all to authenticated
  using (public.is_admin() or public.current_role() = 'warehouse')
  with check (public.is_admin() or public.current_role() = 'warehouse');

drop policy if exists purchase_order_lines_staff_read on public.purchase_order_lines;
create policy purchase_order_lines_staff_read
  on public.purchase_order_lines for select to authenticated
  using (public.is_staff());

drop policy if exists purchase_order_lines_admin_warehouse_write on public.purchase_order_lines;
create policy purchase_order_lines_admin_warehouse_write
  on public.purchase_order_lines for all to authenticated
  using (public.is_admin() or public.current_role() = 'warehouse')
  with check (public.is_admin() or public.current_role() = 'warehouse');

grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;
