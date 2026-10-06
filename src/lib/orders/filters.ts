import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { OrderStatusValues } from "./schemas";

/**
 * Shared order-list querying (Phase 4). The list page and the CSV export
 * apply identical filters — search across order number / customer name /
 * email, status, and date range — so both build on these helpers.
 */

export type OrderListFilters = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
};

export type OrderListRow = {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  total: string;
  source: string;
  customer_name: string;
  customer_email: string;
};

export type OrderExportRow = {
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  status: string;
  payment_status: string;
  source: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  shipping_total: string;
  total: string;
  refunded_total: string;
  tracking_number: string;
};

type Client = SupabaseClient<Database>;

const VALID_STATUSES = new Set<string>(OrderStatusValues);

function validStatus(value: string | undefined): (typeof OrderStatusValues)[number] | undefined {
  return value && VALID_STATUSES.has(value)
    ? (value as (typeof OrderStatusValues)[number])
    : undefined;
}

const PAGE_SELECT =
  "id, order_number, created_at, status, payment_status, total, source, customers(first_name, last_name, email)";

const EXPORT_SELECT =
  "order_number, created_at, status, payment_status, source, subtotal, discount_total, tax_total, shipping_total, total, refunded_total, tracking_number, customer_id, customers(first_name, last_name, email)";

/** Strip PostgREST ilike wildcards so a search can't escape its pattern. */
function cleanSearch(q: string | undefined): string {
  return (q ?? "").trim().replace(/[%_\\]/g, "");
}

async function customerIdsForSearch(client: Client, q: string): Promise<string[]> {
  const { data } = await client
    .from("customers")
    .select("id")
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(200);
  return (data ?? []).map((c) => c.id);
}

type CustomerRef = { first_name: string; last_name: string; email: string | null } | null;

function customerOf(row: { customers: CustomerRef | CustomerRef[] }): CustomerRef {
  return Array.isArray(row.customers) ? (row.customers[0] ?? null) : row.customers;
}

function displayName(customer: CustomerRef): string {
  if (!customer) return "—";
  return `${customer.first_name} ${customer.last_name}`.trim() || "—";
}

/**
 * Paginated order rows for the list page, plus the total and per-status
 * counts (counts ignore the status filter so chips stay informative).
 */
export async function fetchOrdersPage(
  client: Client,
  filters: OrderListFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: OrderListRow[]; total: number; statusCounts: Record<string, number> }> {
  const q = cleanSearch(filters.q);
  const status = validStatus(filters.status);

  let query = client
    .from("orders")
    .select(PAGE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });
  if (q) {
    const ids = await customerIdsForSearch(client, q);
    query =
      ids.length > 0
        ? query.or(`order_number.ilike.%${q}%,customer_id.in.(${ids.join(",")})`)
        : query.ilike("order_number", `%${q}%`);
  }
  if (status) query = query.eq("status", status);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  // Per-status counts over the same filter set (minus status itself).
  let countQuery = client.from("orders").select("status").limit(5000);
  if (q) {
    const ids = await customerIdsForSearch(client, q);
    countQuery =
      ids.length > 0
        ? countQuery.or(`order_number.ilike.%${q}%,customer_id.in.(${ids.join(",")})`)
        : countQuery.ilike("order_number", `%${q}%`);
  }
  if (filters.from) countQuery = countQuery.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) countQuery = countQuery.lte("created_at", `${filters.to}T23:59:59Z`);
  const { data: statusRows } = await countQuery;
  const statusCounts: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const rows: OrderListRow[] = (data ?? []).map((row) => {
    const customer = customerOf(row);
    return {
      id: row.id,
      order_number: row.order_number,
      created_at: row.created_at,
      status: row.status,
      payment_status: row.payment_status,
      total: row.total,
      source: row.source,
      customer_name: displayName(customer),
      customer_email: customer?.email ?? "",
    };
  });

  return { rows, total: count ?? 0, statusCounts };
}

/** Full filtered row set for CSV export (capped at 2000). */
export async function fetchOrdersForExport(
  client: Client,
  filters: OrderListFilters,
): Promise<OrderExportRow[]> {
  const q = cleanSearch(filters.q);
  const status = validStatus(filters.status);
  let query = client
    .from("orders")
    .select(EXPORT_SELECT)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (q) {
    const ids = await customerIdsForSearch(client, q);
    query =
      ids.length > 0
        ? query.or(`order_number.ilike.%${q}%,customer_id.in.(${ids.join(",")})`)
        : query.ilike("order_number", `%${q}%`);
  }
  if (status) query = query.eq("status", status);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const customer = customerOf(row);
    return {
      order_number: row.order_number,
      created_at: row.created_at,
      customer_name: displayName(customer),
      customer_email: customer?.email ?? "",
      status: row.status,
      payment_status: row.payment_status,
      source: row.source,
      subtotal: row.subtotal,
      discount_total: row.discount_total,
      tax_total: row.tax_total,
      shipping_total: row.shipping_total,
      total: row.total,
      refunded_total: row.refunded_total,
      tracking_number: row.tracking_number ?? "",
    };
  });
}
