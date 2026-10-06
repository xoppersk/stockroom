-- =============================================================================
-- 00004_customers.sql — customers and their addresses
--
-- RLS: all staff read; writes (insert/update/delete) by admin and support.
-- =============================================================================

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null default '',
  email      text null,
  phone      text null,
  tags       text[] not null default '{}',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness for non-null emails (nulls stay non-distinct).
drop index if exists customers_email_lower_uidx;
create unique index customers_email_lower_uidx
  on public.customers (lower(email)) where email is not null;

create index if not exists customers_email_idx on public.customers (lower(email));

comment on table public.customers is 'Store customers (shoppers + manual-order customers).';

create table if not exists public.customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  label       text not null default 'shipping',
  line1       text not null,
  line2       text null,
  city        text not null,
  region      text not null,
  postal_code text not null,
  country     text not null default 'US',
  is_default  boolean not null default false
);

create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (customer_id);

comment on table public.customer_addresses is 'Shipping/billing addresses per customer.';

-- updated_at maintenance
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read
  on public.customers for select to authenticated
  using (public.is_staff());

drop policy if exists customers_admin_support_write on public.customers;
create policy customers_admin_support_write
  on public.customers for all to authenticated
  using (public.is_admin() or public.current_role() = 'support')
  with check (public.is_admin() or public.current_role() = 'support');

drop policy if exists customer_addresses_staff_read on public.customer_addresses;
create policy customer_addresses_staff_read
  on public.customer_addresses for select to authenticated
  using (public.is_staff());

drop policy if exists customer_addresses_admin_support_write on public.customer_addresses;
create policy customer_addresses_admin_support_write
  on public.customer_addresses for all to authenticated
  using (public.is_admin() or public.current_role() = 'support')
  with check (public.is_admin() or public.current_role() = 'support');

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
