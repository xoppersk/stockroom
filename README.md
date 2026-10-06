# Stockroom

Inventory & order management for **Juniper Supply Co.**, a demo home & lifestyle goods store — with a public storefront, Stripe Checkout, and a staff admin covering the full commerce loop: catalog → cart → checkout → payment webhooks → fulfillment → refunds, plus inventory, customers, discounts, and a dashboard.

Built as a portfolio flagship to show production-grade full-stack work: real money handling, exactly-once webhook processing, row-level security, and a tested state machine — not a CRUD demo.

> **Live demo:** not deployed yet. Deploy to Vercel (see [Deploy](#deploy)), then add the admin + storefront URLs here.

## Architecture

```
                        ┌─────────────────────────────┐
                        │        Next.js 16 App       │
                        │                             │
  Shopper ──▶ (shop) routes ──┐                       │
          │  / · /shop · /cart │                       │
          │  /checkout/success │                       │
          └────────────────────┘                       │
                        ┌─────────────────────────────┐│
  Staff ──▶ (app) routes │ Server Actions + Route      ││
          │ /dashboard   │ Handlers (Zod-validated,    ││
          │ /orders      │ role re-checked server-side)││
          │ /products    └──────────────┬──────────────┘│
          │ /inventory                  │               │
          │ /customers                  ▼               │
          │ /discounts        ┌─────────────────────┐   │
          └──────────────────▶│  PostgreSQL         │   │
                              │  (Supabase-hosted)  │   │
                              │                     │   │
                              │  • Row Level        │   │
                              │    Security on all  │   │
                              │    21 tables        │   │
                              │  • SECURITY DEFINER │   │
                              │    RPCs:            │   │
                              │    create_order_    │   │
                              │    with_items,      │   │
                              │    adjust_inventory,│   │
                              │    create_checkout_ │   │
                              │    session,         │   │
                              │    handle_stripe_   │   │
                              │    event            │   │
                              └─────────┬───────────┘   │
                                        │               │
  Stripe ──▶ /api/webhooks/stripe ───────┘               │
             (raw-body HMAC verify → idempotent dispatch)│
                                        │               │
                                        ▼               │
                              ┌─────────────────────┐   │
                              │ Stripe Checkout     │◀──┘
                              │ Sessions + webhooks │
                              │ (test mode)         │
                              └─────────────────────┘
```

**Request flow for a purchase:**

1. Shopper browses `(shop)` routes; cart lives in Postgres (`carts`/`cart_items`), identified by an HttpOnly cookie token — no sign-in required. Totals are computed live from `product_variants.price`; prices are never stored on cart rows and the client never dictates the amount.
2. `POST /api/checkout` calls `create_checkout_session()` (SECURITY DEFINER): locks the cart, re-computes totals from live prices + server-validated discount, creates the `pending` order + `payments` row, and returns a Stripe Checkout Session URL (or a demo-mode order id when no Stripe keys are configured).
3. Stripe redirects to `/checkout/success`, then delivers webhooks to `/api/webhooks/stripe`: raw-body signature verification first, then `handle_stripe_event()` inserts into `webhook_events` (`ON CONFLICT (stripe_event_id) DO NOTHING` → `skipped_duplicate`) and dispatches with forward-only guarded transitions — `pending → paid` (stock decremented via `adjust_inventory`, notification fired, guest token rotated) or `pending → failed` on a declined card. Retries and out-of-order deliveries converge; they can never regress an order.
4. Staff see the order land in `/orders` with a "Storefront" source badge; fulfill/refund flows are unchanged.

**Why the webhook handler is a Postgres function behind a raw-body route:** stock decrements must be exactly-once even when Stripe retries or delivers out of order. Doing the dispatch in SQL keeps the idempotency insert, the state guard, and the inventory move in one transaction — the UNIQUE constraint on `stripe_event_id` is the enforcement, not application memory. The route verifies the HMAC signature before any database work; a bad signature is a 400 with zero writes.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui) — `cacheComponents` enabled; per-route JS budget enforced by `scripts/bundle-gate.mjs` (500 KB/route)
- **PostgreSQL** (via Supabase) — 21 tables, 10 forward-only migrations, seed data for the demo store
- **Row Level Security** — enabled on every table; 40+ policies (staff read, owner-only carts via guest token, public read of *published* products only, admin-only `audit_log`); security-critical writes go through `SECURITY DEFINER` functions with server-side role re-checks, never direct table writes
- **JWT auth** (Supabase Auth: email/password + magic link) with a `user_roles` table (`admin` / `warehouse` / `support`); RLS policies never trust JWT claims for roles
- **Stripe Checkout Sessions + webhooks** (test mode) — signature-verified, idempotent, forward-only state machine
- **Vitest** unit tests, **pgTAP** RLS penetration tests, **ESLint** (incl. React Compiler-era hooks rules), `tsc --noEmit`

## Features

**Storefront** (`(shop)`): home, product listing (search, category/price filters, sort), product detail (gallery, variant picker, stock hints), cart (quantity steppers, live discount-code validation), Stripe Checkout, confirmation page with payment polling.

**Admin** (`(app)`): dashboard (KPIs, revenue chart, order pipeline, low-stock panel, activity feed), orders (filters, bulk fulfill, CSV export, refunds, timeline), product catalog (4-step creation wizard, variant matrix with SKU/price/stock, media manager), inventory (adjust drawer with reason + audit trail, low-stock alerts), customers (notes timeline, tags, apology-code issuance), discounts (builder, derived Active/Scheduled/Paused/Expired status, usage limits), settings (staff invites), global ⌘K search, realtime notifications bell.

**RBAC:** warehouse staff can't refund (UI hides it, server action denies it); support can't adjust stock; only admins manage products, discounts, and settings.

## Run locally

### 1. Prerequisites

- Node 20+, pnpm 10
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker (for `supabase start`)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (for webhook forwarding)

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see `.env.example` for where each value comes from):

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same (public; RLS still applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same — **server only**, never expose to the browser |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys (test mode, `sk_test_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same (`pk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → Webhooks (`whsec_…`); or `stripe listen` locally |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |

Leave the Stripe keys as the `REPLACE_ME` placeholders to run in **demo mode**: checkout completes end-to-end against the real database by feeding a synthetic event through the real webhook state machine (idempotency included — the synthetic event id derives from the order id, so double-invocations are `skipped_duplicate` no-ops).

### 3. Database

```bash
supabase start          # local Postgres + Auth + Storage
supabase db reset        # applies supabase/migrations/*.sql, then supabase/seed.sql
```

The seed loads the Juniper Supply Co. demo store: 4 categories, 12 products (22 variants, 24 images), 20 customers with addresses, 40 orders across all six statuses, 3 discount codes with redemptions, and staff notifications.

### 4. Stripe webhooks (local)

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# paste the printed whsec_… into STRIPE_WEBHOOK_SECRET in .env.local
```

Then check out with a [test card](https://stripe.com/docs/testing) (e.g. `4242 4242 4242 4242`) and watch the order flip to `paid` in `/orders`. To test the declined-card path, use `4000 0000 0000 0002` — the order lands as `failed` and stock is untouched.

### 5. Run

```bash
pnpm install
pnpm dev        # http://localhost:3000  (storefront)
                # http://localhost:3000/dashboard  (admin, after sign-in)
```

### QA gate (must be all green)

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm build          # next build
pnpm bundle:gate    # per-route JS budget (500 KB), reads the build output
pnpm test           # vitest run — 108 tests, see below
```

Database-level RLS penetration tests (pgTAP, forbidden writes as anon/warehouse/support — 0 must succeed):

```bash
supabase db test    # runs supabase/tests/rls_policies.sql
```

## Demo credentials

> **Configure in the Supabase Auth dashboard** (Authentication → Users → Add user), then grant each user exactly one role in the `user_roles` table (`admin`, `warehouse`, or `support`). No demo credentials are committed to this repo — create them per environment.

Suggested test users:

| Role | What to verify |
|---|---|
| `admin` | Full access: products, discounts, settings, refunds, user invites |
| `warehouse` | Can fulfill orders and adjust stock; **cannot** refund or touch settings |
| `support` | Can issue apology discount codes and refund/cancel; **cannot** adjust stock or manage products |

Hitting `/settings` as warehouse/support redirects away (role-gated nav + server-side role check).

## Test coverage

**108 Vitest tests, 13 files, all passing** (`pnpm test`):

| File | Tests | What it pins |
|---|---|---|
| `src/lib/stripe/webhook.test.ts` | 7 | HMAC verification: valid passes; tampered body, wrong secret, garbage/missing header rejected |
| `src/app/api/webhooks/stripe/route.test.ts` | 4 | Route contract: missing header → 400, bad signature → 400 (no DB writes), missing secrets → 500 |
| `src/lib/stripe/event-dispatch.test.ts` | 9 | State-machine mapping incl. **declined card → order `failed`** (no stock move); forward-only guards; partial vs full refunds |
| `src/lib/stripe/idempotency.test.ts` | 3 | Duplicate `stripe_event_id` → `skipped_duplicate`, always 200 (Stripe retries only on 5xx) |
| `src/lib/inventory/guard.test.ts` | 12 | `adjust_inventory` contract: stock can never go negative; serialized concurrent decrements; low-stock threshold crossing |
| `src/lib/supabase/rls.test.ts` | 10 | **Static analysis of all 10 migrations:** RLS enabled on all 21 tables; all 40+ documented policies exist and target the right tables; write-surface negatives (no direct writes to `inventory_levels`, `payments`, `webhook_events`; no DELETE on `orders`) |
| `src/lib/cart/totals.test.ts` | 13 | Cart totals from live variant prices: subtotal math, percentage/fixed discounts, fixed capped at subtotal, cent rounding |
| `src/lib/discounts/status.test.ts` | 12 | `deriveDiscountStatus` across Active / Scheduled / Paused / Expired (date window + usage exhaustion + pause precedence) |
| `src/lib/money.test.ts` | 12 | Money edge cases: string numerics, bad-input fallbacks, cent conversion round-trips |
| `src/lib/format.test.ts` | 10 | Date/discount formatting incl. timezone-independent assertions |
| `src/lib/utils.test.ts`, `src/lib/auth/redirect-path.test.ts`, `src/components/app/nav.test.ts` | 16 | Pre-existing: class merging, safe redirect paths, role-gated nav |

Plus **`supabase/tests/rls_policies.sql`** (pgTAP): scripted forbidden-write attempts as anon/warehouse/support across all tables — requires a local database (`supabase db test`); not part of `pnpm test`.

**Honest gaps:** the Vitest suite is unit/static-analysis only — no test spins up a live database, so the SQL state machine (`handle_stripe_event`), the `FOR UPDATE` race serialization, and the RLS policies themselves are verified by the pgTAP suite and by manual Stripe test-mode runs, not by CI. There are no Playwright end-to-end tests yet (the shopper journey: browse → cart → discount → test-card payment → webhook → confirmation → admin fulfillment is verified manually). The pure TypeScript mirrors (`event-dispatch.ts`, `inventory/guard.ts`) shadow the SQL by convention — if a migration changes the state machine, update the mirror and its tests.

## Project structure

```
src/
  app/
    (app)/            # staff admin: dashboard, orders, products, inventory,
                      # customers, discounts, settings, account
    (auth)/           # login, signup, magic link, password reset
    (shop)/           # public storefront: home (/), /shop, /shop/[slug],
                      # /cart, /checkout/success
    api/
      checkout/       # POST — creates the order + Stripe Checkout Session
      orders/[id]/status/  # GET — pollable order status (confirmation page)
      webhooks/stripe/     # POST — signature-verified Stripe event receiver
    auth/callback/    # Supabase auth callback
  components/
    app/              # shell, sidebar, header, command palette, nav
    ui/               # shadcn/ui primitives
    dashboard/ orders/ products/ inventory/ customers/ discounts/ shop/
  lib/
    cart/             # guest-cart actions + pure totals (totals.ts)
    stripe/           # client, webhook signature verify, event-dispatch
                      # mapping, idempotency contract, demo-mode adapter
    discounts/        # actions, schemas, derived status
    inventory/        # adjust-stock actions + pure guard
    orders/ products/ customers/  # server actions, zod schemas, filters
    shop/             # storefront data layer (service-role, token-scoped)
    supabase/         # browser/server/middleware/service-role clients
    auth/             # get-user, require-user, roles, redirect-path
    money.ts format.ts audit.ts server-action.ts
supabase/
  migrations/         # 00001–00010, forward-only (see DATABASE-SCHEMA.md)
  seed.sql            # Juniper Supply Co. demo data
  tests/              # pgTAP RLS penetration suite
scripts/
  bundle-gate.mjs     # per-route client-JS budget gate (500 KB)
```

Six planning documents live alongside the code's spec (in the portfolio workspace, not this repo): PRD, Technical Requirements, App Flow, Design Brief, Database Schema, Implementation Plan.

## Lessons learned

- **The database is the concurrency primitive.** The inventory race can't be solved in the app layer — `SELECT … FOR UPDATE` inside `_adjust_inventory` serializes concurrent decrements, and the `UNIQUE(stripe_event_id)` constraint (not application memory) makes webhooks exactly-once. Push invariants into Postgres; test the contract, not the implementation.
- **Verify webhooks before touching the database.** Reading the raw body and checking the HMAC signature first means a bad signature is a 400 with zero writes — the route never parses, logs, or stores untrusted bytes.
- **Never let the client dictate money.** Cart rows store no prices; `/api/checkout` re-computes totals from live variant prices and re-validates the discount server-side. The pure `computeCartTotals` is shared so the storefront display and the Checkout Session can't disagree.
- **State machines need forward-only guards.** Stripe redelivers and delivers out of order; `pending → paid/failed` and `paid/fulfilled → refunded` guards mean retries converge instead of regressing orders.
- **RLS is a test target, not a hope.** A static-analysis test parses every migration and asserts RLS is enabled on all 21 tables, all documented policies exist, and the write surface is closed (no direct writes to `inventory_levels`, `payments`, `webhook_events`; no DELETE on `orders`) — so a future migration can't silently drop a policy.
- **Next 16 `cacheComponents` changes the build contract.** `export const dynamic = "force-dynamic"` is a build error now — remove it (request-time APIs like `cookies()` are dynamic by nature) and opt cookie-reading segments out of instant prerender validation with `export const instant = false`. The per-route bundle gate caught a 2.5 KB overage on the product editor; code-splitting the variant-matrix builder behind `next/dynamic` fixed it honestly instead of raising the budget.
- **Derived state beats stored state for discounts.** The `status` column only stores `active`/`paused`; Active/Scheduled/Expired is derived at read time — pausing a campaign stops redemption immediately with no batch job.

## AI-workflow note

This project was built by a coordinated team of AI agents (one per feature area: products, orders/inventory/dashboard, customers/discounts, storefront/Stripe) under a human tech lead, then hardened by a dedicated QA pass. The workflow that made it work:

- **Spec first:** six planning documents (PRD → implementation plan) were written and reviewed before any code, so agents built against contracts (RPC signatures, RLS policy matrix, state machines) instead of improvising.
- **Contracts over code:** cross-agent boundaries were SQL functions and TypeScript modules with documented semantics; the QA pass added pure-function mirrors of the SQL contracts (`event-dispatch.ts`, `inventory/guard.ts`, `cart/totals.ts`) specifically to make them unit-testable.
- **Verification is a separate job:** the QA agent ran `tsc`, ESLint, `next build`, the bundle gate, and Vitest as a gate — and fixed what the build surfaced (stale `.next` types, React hooks purity violations, the `cacheComponents` migration, the bundle overage) rather than the feature agents self-certifying.
- **Reviewed, not blindly accepted:** every agent output was read before merging — the RLS policy names in the static-analysis test were cross-checked against the actual migrations (not the schema doc, which uses different generic names), and test assertions were checked against real SDK behavior (e.g. Stripe's `generateTestHeaderString`).

## Deploy

Vercel + Supabase (production project):

1. `supabase db push` (or apply `supabase/migrations/*.sql` in order) against the production project; load `supabase/seed.sql` for the demo store.
2. Set env vars in Vercel (all environments): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test mode), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.
3. Register `https://<your-domain>/api/webhooks/stripe` in the Stripe dashboard (Developers → Webhooks, test mode).
4. Create the admin/warehouse/support users in Supabase Auth and grant roles in `user_roles`.
5. Smoke test: sign in as each role, run a test-mode purchase end-to-end, fulfill it, refund it, adjust stock, pause a discount.

---

*Stack: Next.js 16 · TypeScript (strict) · PostgreSQL · Row Level Security · JWT auth · Stripe Checkout Sessions + webhooks · Tailwind v4 · shadcn/ui · Vitest · pgTAP*
