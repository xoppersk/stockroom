-- =============================================================================
-- 00001_init.sql — base schema for the Sevyn App Starter
--
--   * public.profiles        — one row per auth.users row (1:1, PK = FK)
--   * handle_new_user()      — trigger: creates a profile on signup
--   * RLS                    — owner-only SELECT / UPDATE on profiles
--
-- Apply with the Supabase CLI:
--   supabase db push        (remote, after `supabase link`)
--   supabase db reset       (local dev — replays every migration)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  timezone      text not null default 'UTC',
  -- Multi-tenant clones point this at their own teams/organizations table.
  -- The starter ships no teams table; requireOrgAccess() (src/lib/auth)
  -- documents the expected membership table + RLS pattern.
  active_team_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile for each auth user. Created automatically by the on_auth_user_created trigger.';

-- ---------------------------------------------------------------------------
-- handle_new_user(): create a profile whenever someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
-- SECURITY DEFINER: the trigger must write to public.profiles, which has RLS
-- enabled with no INSERT policy for regular roles. Fixed search_path so the
-- function can't be hijacked via search_path manipulation.
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  -- Idempotent: auth webhooks can retry, so never fail on a duplicate.
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only read/write on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Authenticated users can read their own profile only.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- Authenticated users can update their own profile only.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT / DELETE policies on purpose:
--   * INSERT happens in handle_new_user(), which runs as SECURITY DEFINER and
--     bypasses RLS — users must never mint their own profile rows.
--   * DELETE cascades from auth.users (account deletion removes the profile).
--
-- NOTE: the anon key gets nothing here — signed-out requests see zero rows.

-- Table-level grants. RLS policies decide *which* rows a role may touch, but
-- without a grant the role can't reach the table at all. Keep grants minimal:
-- authenticated can SELECT + UPDATE (policies narrow both to the owner's row);
-- anon gets nothing.
grant select, update on public.profiles to authenticated;

-- =============================================================================
-- RLS HELPER CONVENTIONS (for multi-tenant clones — copy, don't uncomment here)
-- =============================================================================
--
-- 1. One SECURITY DEFINER helper per membership question. Name it is_<thing>,
--    keep search_path fixed, and return a plain boolean:
--
--      create or replace function public.is_team_member(p_team_id uuid)
--      returns boolean
--      language sql
--      security definer
--      set search_path = public
--      stable
--      as $$
--        select exists (
--          select 1
--          from public.team_memberships m
--          where m.team_id = p_team_id
--            and m.user_id = (select auth.uid())
--            and m.status = 'active'
--        );
--      $$;
--
-- 2. Policies call the helper — never inline the join:
--
--      create policy widgets_team_read
--        on public.widgets
--        for select
--        to authenticated
--        using (public.is_team_member(team_id));
--
-- 3. Conventions that keep policies fast and safe:
--      * Wrap auth.uid() in (select ...) so Postgres evaluates it once per
--        statement, not once per row (initplan, not a filter).
--      * Helpers are SECURITY DEFINER + fixed search_path, STABLE, and touch
--        only the membership table — they must not leak rows themselves.
--      * One policy per (table, command, role-group). Name it
--        <table>_<scope>_<command>: e.g. widgets_team_read, widgets_owner_delete.
--      * Prefer `to authenticated` over `to public`; anon gets nothing unless a
--        page is genuinely public.
--      * Every new policy gets a pgTAP test in supabase/tests/rls_policies.sql
--        before merge — RLS you can't prove is RLS you don't have.
-- =============================================================================
