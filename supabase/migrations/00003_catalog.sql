-- =============================================================================
-- 00003_catalog.sql — product catalog
--
--   * public.categories, public.products, public.product_variants,
--     public.product_images
--   * RLS: staff read everything; the public storefront reads published
--     products (+ their variants/images) and category names/slugs only;
--     writes are admin-only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  parent_id  uuid null references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.categories is 'Product categories. Names/slugs are public for the storefront.';

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text not null unique,
  description text not null default '',
  category_id uuid null references public.categories (id) on delete set null,
  tags        text[] not null default '{}',
  status      text not null default 'draft'
              check (status in ('draft', 'published', 'archived')),
  created_by  uuid null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_status_idx on public.products (status);
create index if not exists products_category_idx on public.products (category_id);

comment on table public.products is 'Sellable products. Only status=''published'' rows are visible to the storefront.';

-- ---------------------------------------------------------------------------
-- product_variants: one row per sellable variant (e.g. Size M × Color Terracotta)
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  title            text not null,
  sku              text not null unique,
  option_values    jsonb not null default '{}',
  price            numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) null check (compare_at_price >= 0),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, title)
);

create index if not exists product_variants_product_idx on public.product_variants (product_id);

comment on table public.product_variants is
  'Sellable variants. Prices are the source of truth — carts never store prices.';

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt_text     text not null default '',
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists product_images_product_idx on public.product_images (product_id, position);

comment on table public.product_images is
  'Ordered gallery images per product; storage_path points into the product-images bucket.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses public.set_updated_at() from 00001)
-- ---------------------------------------------------------------------------
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

-- categories: staff read all; the storefront reads everything (names/slugs —
-- anon is additionally column-restricted by grant below).
drop policy if exists categories_staff_read on public.categories;
create policy categories_staff_read
  on public.categories for select to authenticated
  using (public.is_staff());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read
  on public.categories for select to anon, authenticated
  using (true);

-- products: staff read all; public reads published only; admin writes.
drop policy if exists products_staff_read on public.products;
create policy products_staff_read
  on public.products for select to authenticated
  using (public.is_staff());

drop policy if exists products_public_published_read on public.products;
create policy products_public_published_read
  on public.products for select to anon, authenticated
  using (status = 'published');

drop policy if exists products_admin_write on public.products;
create policy products_admin_write
  on public.products for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- product_variants / product_images: staff read all; public reads rows whose
-- product is published; admin writes.
drop policy if exists product_variants_staff_read on public.product_variants;
create policy product_variants_staff_read
  on public.product_variants for select to authenticated
  using (public.is_staff());

drop policy if exists product_variants_public_published_read on public.product_variants;
create policy product_variants_public_published_read
  on public.product_variants for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.status = 'published'
    )
  );

drop policy if exists product_variants_admin_write on public.product_variants;
create policy product_variants_admin_write
  on public.product_variants for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_images_staff_read on public.product_images;
create policy product_images_staff_read
  on public.product_images for select to authenticated
  using (public.is_staff());

drop policy if exists product_images_public_published_read on public.product_images;
create policy product_images_public_published_read
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id and p.status = 'published'
    )
  );

drop policy if exists product_images_admin_write on public.product_images;
create policy product_images_admin_write
  on public.product_images for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Grants. Anon reads published catalog rows only (policies filter); anon sees
-- category id/name/slug/parent_id columns only — "names/slugs only" per §3.
grant select on public.products to anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant select (id, name, slug, parent_id) on public.categories to anon;
grant select on public.categories to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant insert, update, delete on public.product_images to authenticated;
