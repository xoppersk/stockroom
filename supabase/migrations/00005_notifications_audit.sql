-- =============================================================================
-- 00005_notifications_audit.sql — staff notifications and the audit log
--
-- Created before inventory/orders so their SECURITY DEFINER functions can
-- write notifications + audit entries without forward references.
--
-- RLS: notifications — staff read their own + broadcasts, and mark their own
-- read; audit_log — admin read only. Inserts happen exclusively through
-- SECURITY DEFINER functions (no INSERT policies on purpose).
-- =============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid null references public.profiles (id) on delete cascade,
  kind       text not null
             check (kind in ('new_order', 'low_stock', 'refund_issued', 'order_cancelled')),
  title      text not null,
  body       text not null default '',
  link       text null,
  read_at    timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

comment on table public.notifications is
  'In-app staff alerts. user_id NULL = broadcast to all staff. Written only by SECURITY DEFINER functions.';

create table if not exists public.audit_log (
  id         bigint primary key generated always as identity,
  actor_id   uuid null references public.profiles (id),
  action     text not null,
  table_name text not null,
  row_id     text not null,
  before     jsonb null,
  after      jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_table_row_idx
  on public.audit_log (table_name, row_id, created_at desc);

comment on table public.audit_log is
  'Append-only record of sensitive mutations. Written only by SECURITY DEFINER functions.';

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE-SCHEMA.md §3)
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Users read their own notifications plus broadcasts.
drop policy if exists notifications_own_or_broadcast_read on public.notifications;
create policy notifications_own_or_broadcast_read
  on public.notifications for select to authenticated
  using (
    public.is_staff()
    and (user_id = (select auth.uid()) or user_id is null)
  );

-- Users mark their own notifications read.
drop policy if exists notifications_mark_read_update on public.notifications;
create policy notifications_mark_read_update
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- audit_log: admin read only. No INSERT/UPDATE/DELETE policies — inserts run
-- inside SECURITY DEFINER functions, which bypass RLS.
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read
  on public.audit_log for select to authenticated
  using (public.is_admin());

grant select, update on public.notifications to authenticated;
grant select on public.audit_log to authenticated;
