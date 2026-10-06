-- =============================================================================
-- 00002_stockroom_roles.sql — Stockroom identity
--
--   * public.profiles      — reshaped from the starter (email + full_name)
--   * public.user_roles    — exactly one role per staff user
--   * current_role() / is_admin() / is_staff() — SECURITY DEFINER helpers
--   * guest_cart_token()   — storefront guest identity for RLS
--   * handle_new_user()    — updated signup trigger
--   * RLS                  — staff-read + self-read/update on profiles;
--                            staff-read + admin-write on user_roles
--
-- Forward-only: this migration adapts 00001 rather than rewriting it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: Stockroom shape (DATABASE-SCHEMA.md §1)
-- 00001 created display_name/timezone/active_team_id; Stockroom needs
-- email + full_name. Add → backfill from auth.users → enforce NOT NULL →
-- drop the starter-only columns.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;

update public.profiles p
set email = coalesce(p.email, u.email),
    full_name = coalesce(
      nullif(p.full_name, ''),
      nullif(p.display_name, ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Staff member'
    )
from auth.users u
where u.id = p.id
  and (p.email is null or p.full_name is null);

alter table public.profiles alter column email set not null;
alter table public.profiles alter column full_name set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_unique') then
    alter table public.profiles add constraint profiles_email_unique unique (email);
  end if;
end $$;

alter table public.profiles drop column if exists display_name;
alter table public.profiles drop column if exists timezone;
alter table public.profiles drop column if exists active_team_id;

comment on table public.profiles is
  'Staff user profile, 1:1 with auth.users. Created by the on_auth_user_created trigger.';

-- ---------------------------------------------------------------------------
-- user_roles: exactly one role per staff user (DATABASE-SCHEMA.md §1)
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null check (role in ('admin', 'warehouse', 'support')),
  granted_at timestamptz not null default now(),
  granted_by uuid null references public.profiles (id)
);

comment on table public.user_roles is
  'Exactly one role per staff user. Roles are read from this table — never from JWT claims.';

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER + fixed search_path so RLS policies can call
-- them without recursing into user_roles' own policies, and so they cannot be
-- hijacked via search_path manipulation.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = (select auth.uid());
$$;

comment on function public.current_role() is
  'Returns the caller''s staff role, or NULL when signed out / role-less.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null;
$$;

-- ---------------------------------------------------------------------------
-- guest_cart_token(): the storefront guest identity for RLS.
-- The server sets `app.guest_token` per request from the HttpOnly cart cookie
-- (Phase 9); this helper exposes it to RLS. It is never trusted from client
-- input — only from the server-set setting.
-- ---------------------------------------------------------------------------
create or replace function public.guest_cart_token()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when current_setting('app.guest_token', true)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then current_setting('app.guest_token', true)::uuid
    else null
  end;
$$;

comment on function public.guest_cart_token() is
  'Guest cart token from the server-set app.guest_token setting; NULL when absent or malformed.';

-- ---------------------------------------------------------------------------
-- handle_new_user(): create a Stockroom-shaped profile whenever someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Staff member'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  -- Idempotent: auth webhooks can retry, so never fail on a duplicate.
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The on_auth_user_created trigger from 00001 already points at this function;
-- create or replace above is enough.

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

-- Staff can read all profiles (needed for actor names); anyone can read their
-- own row (covers the window between invite acceptance and role grant).
create policy profiles_staff_read
  on public.profiles for select to authenticated
  using (public.is_staff());

create policy profiles_self_read
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Users can update only their own row.
create policy profiles_self_update
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- user_roles: readable by staff (role checks run through the SECURITY DEFINER
-- helpers, which bypass RLS); writable by admin only.
create policy user_roles_staff_read
  on public.user_roles for select to authenticated
  using (public.is_staff());

create policy user_roles_admin_write
  on public.user_roles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Table-level grants. RLS policies decide *which* rows a role may touch, but
-- without a grant the role can't reach the table at all.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
