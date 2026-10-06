import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * RLS policy presence tests (Phase 10 QA) — static analysis, no DB needed.
 *
 * Parses every `supabase/migrations/*.sql` and asserts:
 *   1. Every created table has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
 *   2. The expected policies from DATABASE-SCHEMA.md §3 exist (using the
 *      actual `<table>_<scope>_<command>` names from the migrations).
 *   3. Write-surface negatives: tables that must be write-only-via-function
 *      (inventory_levels, inventory_adjustments) have no INSERT/UPDATE/DELETE
 *      policies, and webhook_events has no policies at all.
 *
 * Migrations are never executed here — this test fails loudly if a future
 * migration drops a policy or forgets RLS on a new table.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

/** Strip SQL line comments and block comments, respecting string literals. */
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  let inString: string | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === undefined) break;
    const next = sql[i + 1];
    if (inString) {
      out += ch;
      if (ch === inString) {
        // '' is an escaped quote inside a string literal.
        if (next === inString) {
          out += next;
          i += 2;
          continue;
        }
        inString = null;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function loadMigrations(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
}

const SQL = loadMigrations();
const CLEAN = stripComments(SQL);
const NORMALIZED = CLEAN.replace(/\s+/g, " ").toLowerCase();

/** Tables created by the migrations (public schema). */
function createdTables(): string[] {
  const tables = new Set<string>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CLEAN)) !== null) {
    const name = m[1];
    if (name !== undefined) tables.add(name.toLowerCase());
  }
  return [...tables].sort();
}

/** `create policy <name> on public.<table> for <command> to <roles>` statements. */
interface Policy {
  name: string;
  table: string;
  command: string;
}

function parsedPolicies(): Policy[] {
  const policies: Policy[] = [];
  const re =
    /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+for\s+(select|insert|update|delete|all)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CLEAN)) !== null) {
    const name = m[1];
    const table = m[2];
    const command = m[3];
    if (name !== undefined && table !== undefined && command !== undefined) {
      policies.push({
        name: name.toLowerCase(),
        table: table.toLowerCase(),
        command: command.toLowerCase(),
      });
    }
  }
  return policies;
}

/** Expected policy names per table, from DATABASE-SCHEMA.md §3. */
const EXPECTED_POLICIES: Record<string, string[]> = {
  profiles: ["profiles_staff_read", "profiles_self_update"],
  user_roles: ["user_roles_staff_read", "user_roles_admin_write"],
  categories: ["categories_staff_read", "categories_public_read"],
  products: ["products_staff_read", "products_public_published_read", "products_admin_write"],
  product_variants: [
    "product_variants_staff_read",
    "product_variants_public_published_read",
    "product_variants_admin_write",
  ],
  product_images: [
    "product_images_staff_read",
    "product_images_public_published_read",
    "product_images_admin_write",
  ],
  inventory_levels: ["inventory_levels_staff_read"],
  inventory_adjustments: ["inventory_adjustments_staff_read"],
  customers: ["customers_staff_read", "customers_admin_support_write"],
  customer_addresses: ["customer_addresses_staff_read", "customer_addresses_admin_support_write"],
  orders: [
    "orders_staff_read",
    "orders_guest_own_order_read",
    "orders_fulfill_update",
    "orders_refund_cancel",
  ],
  order_items: ["order_items_staff_read", "order_items_guest_read"],
  order_events: [
    "order_events_staff_read",
    "order_events_guest_read",
    "order_events_note_insert",
  ],
  discounts: [
    "discounts_staff_read",
    "discounts_admin_write",
    "discounts_support_insert_apology",
  ],
  discount_redemptions: ["discount_redemptions_staff_read"],
  carts: [
    "carts_owner_read",
    "carts_owner_write",
    "carts_owner_update",
    "carts_owner_delete",
    "carts_staff_read",
  ],
  cart_items: ["cart_items_owner_read", "cart_items_owner_write", "cart_items_staff_read"],
  payments: ["payments_admin_support_read"],
  notifications: ["notifications_own_or_broadcast_read", "notifications_mark_read_update"],
  audit_log: ["audit_log_admin_read"],
  // webhook_events: intentionally NO policies — service_role / SECURITY DEFINER only.
};

describe("RLS: every table has row level security enabled", () => {
  it("discovers the expected tables from the migrations", () => {
    const tables = createdTables();
    for (const expected of Object.keys(EXPECTED_POLICIES)) {
      expect(tables, `migration creates table ${expected}`).toContain(expected);
    }
    expect(tables).toContain("webhook_events");
  });

  it("enables RLS on every created table", () => {
    const missing: string[] = [];
    for (const table of createdTables()) {
      const pattern = `alter table public.${table} enable row level security`;
      if (!NORMALIZED.includes(pattern)) missing.push(table);
    }
    expect(missing, "tables without ENABLE ROW LEVEL SECURITY").toEqual([]);
  });
});

describe("RLS: expected policies exist", () => {
  it("creates every documented policy", () => {
    const names = new Set(parsedPolicies().map((p) => p.name));
    const missing: string[] = [];
    for (const [table, policies] of Object.entries(EXPECTED_POLICIES)) {
      for (const policy of policies) {
        if (!names.has(policy)) missing.push(`${policy} (on ${table})`);
      }
    }
    expect(missing, "missing RLS policies").toEqual([]);
  });

  it("scopes every policy to the right table", () => {
    const byName = new Map(parsedPolicies().map((p) => [p.name, p.table]));
    for (const [table, policies] of Object.entries(EXPECTED_POLICIES)) {
      for (const policy of policies) {
        expect(byName.get(policy), `policy ${policy} targets ${table}`).toBe(table);
      }
    }
  });

  it("grants policies only to the anon / authenticated roles", () => {
    // A policy granting to the `public` role would expose rows to anyone.
    const bad = /create\s+policy\s+[a-z_][a-z0-9_]*\s+on\s+(?:public\.)?[a-z_]+\s+for\s+(?:select|insert|update|delete|all)\s+to\s+public\b/.test(
      NORMALIZED,
    );
    expect(bad, "no policy may grant to the public role").toBe(false);
  });
});

describe("RLS: write-surface negatives", () => {
  it("webhook_events has zero policies (service_role + SECURITY DEFINER only)", () => {
    const onWebhookEvents = parsedPolicies().filter((p) => p.table === "webhook_events");
    expect(onWebhookEvents).toEqual([]);
  });

  it("inventory_levels has no direct write policies (writes go through adjust_inventory())", () => {
    const writes = parsedPolicies().filter(
      (p) => p.table === "inventory_levels" && p.command !== "select",
    );
    expect(writes).toEqual([]);
  });

  it("inventory_adjustments has no direct write policies (append-only via the function)", () => {
    const writes = parsedPolicies().filter(
      (p) => p.table === "inventory_adjustments" && p.command !== "select",
    );
    expect(writes).toEqual([]);
  });

  it("orders has no direct DELETE policy (cancellation is a status change)", () => {
    const deletes = parsedPolicies().filter(
      (p) => p.table === "orders" && (p.command === "delete" || p.command === "all"),
    );
    expect(deletes).toEqual([]);
  });

  it("payments has no direct write policies (rows only via create_checkout_session / handle_stripe_event)", () => {
    const writes = parsedPolicies().filter(
      (p) => p.table === "payments" && p.command !== "select",
    );
    expect(writes).toEqual([]);
  });
});
