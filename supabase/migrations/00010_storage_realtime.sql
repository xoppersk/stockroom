-- =============================================================================
-- 00010_storage_realtime.sql — product-images bucket and realtime config
--
--   * storage bucket `product-images` (public read, staff write, 5 MB limit,
--     image MIME allowlist enforced by the storage layer)
--   * supabase_realtime publication: orders, inventory_levels, notifications
--   * REPLICA IDENTITY FULL on orders + inventory_levels (before/after values
--     in UPDATE payloads)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Bucket. file_size_limit + allowed_mime_types are enforced by Supabase
-- Storage itself; the 5 MB / jpeg-png-webp rules from DATABASE-SCHEMA.md §5
-- therefore hold for every uploader, including signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies (DATABASE-SCHEMA.md §5)
-- Path pattern: {product_id}/{variant_or_gallery}/{uuid}.jpg
-- ---------------------------------------------------------------------------
drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product-images staff insert" on storage.objects;
create policy "product-images staff insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "product-images staff update" on storage.objects;
create policy "product-images staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff())
  with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "product-images staff delete" on storage.objects;
create policy "product-images staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());

-- ---------------------------------------------------------------------------
-- Realtime (DATABASE-SCHEMA.md §6)
-- RLS still applies to realtime payloads: subscribers only receive rows
-- their policies allow.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_levels'
    ) then
      alter publication supabase_realtime add table public.inventory_levels;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

alter table public.orders replica identity full;
alter table public.inventory_levels replica identity full;
