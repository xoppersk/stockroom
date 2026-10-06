-- =============================================================================
-- 00007_discounts.sql — discount codes and redemptions
--
--   * public.discounts, public.discount_redemptions
--   * apply_discount_validation() — SECURITY DEFINER: returns the discount row
--     or raises with a specific message (not found / paused / scheduled /
--     expired / usage limit / per-customer limit / min order).
--
-- RLS: staff read; admin full write; support may INSERT one-time apology
-- codes only (the one-time/per-customer/percentage shape is enforced in the
-- Phase 6 server action — the policy gates on the support role).
-- Redemptions are written only by create_order_with_items() (no INSERT policy).
-- NOTE: public.discount_redemptions is created in 00008_orders.sql — it has a
-- foreign key to public.orders, which does not exist until that migration.
-- =============================================================================

create table if not exists public.discounts (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  kind              text not null check (kind in ('percentage', 'fixed')),
  value             numeric(12,2) not null check (value > 0),
  usage_limit       integer null check (usage_limit > 0),
  per_customer_limit integer null check (per_customer_limit > 0),
  min_order_value   numeric(12,2) not null default 0 check (min_order_value >= 0),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz null,
  status            text not null default 'active' check (status in ('active', 'paused')),
  created_by        uuid null references public.profiles (id),
  created_at        timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

comment on table public.discounts is
  'Discount codes, stored uppercase. Effective state (Active/Scheduled/Paused/Expired) is derived at read time.';

-- Normalize codes to uppercase on write.
create or replace function public.discounts_normalize_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

drop trigger if exists discounts_normalize_code on public.discounts;
create trigger discounts_normalize_code
  before insert or update of code on public.discounts
  for each row execute function public.discounts_normalize_code();

-- ---------------------------------------------------------------------------
-- apply_discount_validation(p_code, p_subtotal, p_customer_id)
-- Returns the discount row, or raises with a specific, user-facing message.
-- SECURITY DEFINER so guest checkout (anon) can validate codes without
-- getting SELECT on the discounts table.
-- ---------------------------------------------------------------------------
create or replace function public.apply_discount_validation(
  p_code text,
  p_subtotal numeric,
  p_customer_id uuid default null
)
returns public.discounts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code         text := upper(btrim(coalesce(p_code, '')));
  v_discount     public.discounts%rowtype;
  v_used         integer;
  v_customer_used integer;
begin
  if v_code = '' then
    raise exception 'Discount code is required.';
  end if;

  select * into v_discount from public.discounts where code = v_code;
  if not found then
    raise exception 'Discount code "%" was not found.', v_code;
  end if;

  if v_discount.status = 'paused' then
    raise exception 'Discount code "%" is paused.', v_code;
  end if;

  if now() < v_discount.starts_at then
    raise exception 'Discount code "%" is not active yet.', v_code;
  end if;

  if v_discount.ends_at is not null and now() > v_discount.ends_at then
    raise exception 'Discount code "%" has expired.', v_code;
  end if;

  if v_discount.usage_limit is not null then
    select count(*) into v_used
      from public.discount_redemptions
     where discount_id = v_discount.id;
    if v_used >= v_discount.usage_limit then
      raise exception 'Discount code "%" has reached its usage limit.', v_code;
    end if;
  end if;

  if v_discount.per_customer_limit is not null and p_customer_id is not null then
    select count(*) into v_customer_used
      from public.discount_redemptions
     where discount_id = v_discount.id
       and customer_id = p_customer_id;
    if v_customer_used >= v_discount.per_customer_limit then
      raise exception 'Discount code "%" has already been used the maximum number of times for this customer.', v_code;
    end if;
  end if;

  if p_subtotal < v_discount.min_order_value then
    raise exception 'Discount code "%" requires a minimum order of $%.2f.', v_code, v_discount.min_order_value;
  end if;

  return v_discount;
end;
$$;

comment on function public.apply_discount_validation(text, numeric, uuid) is
  'Validates a discount code against schedule, limits, and min order. Raises with a specific message on failure.';

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.discounts enable row level security;

drop policy if exists discounts_staff_read on public.discounts;
create policy discounts_staff_read
  on public.discounts for select to authenticated
  using (public.is_staff());

drop policy if exists discounts_admin_write on public.discounts;
create policy discounts_admin_write
  on public.discounts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Support may insert one-time apology codes; the Phase 6 server action
-- enforces the shape (kind='percentage', usage_limit=1, per_customer_limit=1).
drop policy if exists discounts_support_insert_apology on public.discounts;
create policy discounts_support_insert_apology
  on public.discounts for insert to authenticated
  with check (public.current_role() = 'support');

grant select, insert, update, delete on public.discounts to authenticated;
