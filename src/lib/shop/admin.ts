/* Admin-console data layer (server-only by convention — imports the
 * request-scoped session client; never import from a Client Component).
 *
 * Every read goes through src/lib/supabase/server.ts createClient() so
 * staff RLS + current_role() are the authorization (ruling 1). The
 * client is cast to the shop-typed SupabaseClient<ShopDatabase>: the
 * auth-slice Database type in supabase/types.ts does not know the shop
 * tables, but it is the SAME session/cookies underneath.
 *
 * Mappers (exported, pure) convert DB rows into the src/lib/types.ts
 * view shapes per rulings 4, 5, 7, 8, 9, 10. Reads tolerate migration
 * 00012 not yet applied (ruling 3): full column set first, legacy set on
 * a PostgREST column error.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { CUTOFF_LABEL, SHOP_TIMEZONE } from "@/lib/config";
import {
  customersTotalsFrom,
  deriveDiscountStatus,
  deriveRefundStatus,
  discountsTotalsFrom,
  heldOrders as deriveHeldOrders,
  inventorySummary,
  isOpenOrder,
  listSkus as deriveListSkus,
} from "@/lib/derive";
import { dashboardFromData } from "@/lib/derive";
import type {
  AuditEntry,
  AuditList,
  Customer,
  CustomersTotals,
  DashboardData,
  Discount,
  DiscountTotals,
  Order,
  OrderStage,
  PaymentStatus,
  Product,
  ProductStatus,
  PurchaseOrder,
  RevenueDay,
  Sku,
  StockMovement,
  TeamMember,
} from "@/lib/types";
import type {
  ShopAuditLog,
  ShopCustomer,
  ShopCustomerAddress,
  ShopDatabase,
  ShopDiscount,
  ShopDiscountRedemption,
  ShopInventoryAdjustment,
  ShopOrder,
  ShopOrderEvent,
  ShopOrderItem,
  ShopProfile,
  ShopPurchaseOrder,
  ShopPurchaseOrderLine,
  ShopUserRole,
  ShopVariant,
} from "./types";

export type DbRole = "admin" | "warehouse" | "support";
export type AdminClient = SupabaseClient<ShopDatabase>;

async function db(): Promise<AdminClient> {
  return (await createClient()) as unknown as AdminClient;
}

/* ---------------- shared helpers ---------------- */

/** Money coercion: numeric columns arrive as string OR number. */
export function cents(numeric: string | number | null | undefined): number {
  if (numeric == null) return 0;
  return Math.round(Number(numeric) * 100);
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function isColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column|schema cache/i.test(
      error.message ?? "",
    )
  );
}

/* ---- real dates in SHOP_TIMEZONE (ruling 8) ---- */

const dayPartsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function dayKey(d: Date): string {
  let y = 0,
    m = 0,
    day = 0;
  for (const p of dayPartsFmt.formatToParts(d)) {
    if (p.type === "year") y = Number(p.value);
    if (p.type === "month") m = Number(p.value);
    if (p.type === "day") day = Number(p.value);
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDayKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

const monthDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  month: "short",
  day: "numeric",
});
const fullDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  month: "long",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const time24Fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const weekdayFullFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});
const weekdayShortFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function placedDayOf(iso: string, now: Date): Order["placedDay"] {
  const key = dayKey(new Date(iso));
  const today = dayKey(now);
  if (key === today) return "today";
  if (key === shiftDayKey(today, -1)) return "yesterday";
  return "earlier";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/* ---------------- column sets (00012 tolerance) ---------------- */

const ORDER_COLS_LEGACY =
  "id, order_number, customer_id, status, payment_status, subtotal, discount_total, tax_total, shipping_total, total, refunded_total, currency, discount_code, shipping_address, tracking_number, source, external_id, guest_token, stripe_checkout_session_id, created_by, created_at, updated_at";
const ORDER_COLS_FULL = `${ORDER_COLS_LEGACY}, fulfillment_stage`;
const ITEM_COLS =
  "id, order_id, variant_id, product_title, variant_title, sku, quantity, unit_price, line_total";
const EVENT_COLS = "id, order_id, event_type, message, metadata, created_by, created_at";
const VARIANT_COLS_LEGACY =
  "id, product_id, title, sku, option_values, price, compare_at_price, position, created_at, updated_at";
const VARIANT_COLS_FULL = `${VARIANT_COLS_LEGACY}, shelf, cost_price`;

/* ================================================================== */
/* Pure mappers (unit-tested in admin.test.ts)                         */
/* ================================================================== */

export type InventoryInfo = {
  onHand: number;
  threshold: number;
  committed: number;
  /** Units of OPEN orders whose stock the DB has ALREADY decremented out
   *  of quantity_on_hand (paid orders; staff-created orders). They are
   *  still physically on the shelf until fulfillment, so the view model's
   *  onShelf = onHand + reserved, and available = onShelf − committed —
   *  without the add-back, paid orders would be subtracted twice (the
   *  RPCs and the seed all decrement on_hand at sale: 00009 webhook,
   *  00011 create_order_with_items, seed.sql). Decrement state is read
   *  from the exact oracle: 'sale' inventory_adjustments carry
   *  reference = order_number. Storefront pending orders have NO sale
   *  adjustment yet (decrement lands on payment), so they claim on_hand
   *  directly. Coordinator integration fix, 2026-10-22. */
  reserved: number;
};

/**
 * Committed per variant: Σ order_items.quantity over orders in status
 * pending/paid. Reserved: the subset of committed whose order_number is
 * in `decremented` (stock already taken in the books). sold30d likewise
 * over the last 30 days with statuses paid/fulfilled.
 */
export function computeCommitments(
  orders: ShopOrder[],
  items: ShopOrderItem[],
  now: Date,
  decremented: ReadonlySet<string> = new Set(),
): { committed: Map<string, number>; reserved: Map<string, number>; sold30d: Map<string, number> } {
  const statusByOrder = new Map(orders.map((o) => [o.id, o]));
  const committed = new Map<string, number>();
  const reserved = new Map<string, number>();
  const sold30d = new Map<string, number>();
  const cutoff = now.getTime() - 30 * 86_400_000;
  for (const item of items) {
    if (!item.variant_id) continue;
    const order = statusByOrder.get(item.order_id);
    if (!order) continue;
    if (order.status === "pending" || order.status === "paid") {
      committed.set(item.variant_id, (committed.get(item.variant_id) ?? 0) + item.quantity);
      if (decremented.has(order.order_number)) {
        reserved.set(item.variant_id, (reserved.get(item.variant_id) ?? 0) + item.quantity);
      }
    }
    if (
      (order.status === "paid" || order.status === "fulfilled") &&
      new Date(order.created_at).getTime() >= cutoff
    ) {
      sold30d.set(item.variant_id, (sold30d.get(item.variant_id) ?? 0) + item.quantity);
    }
  }
  return { committed, reserved, sold30d };
}

/** Order_numbers whose stock the DB has already decremented: 'sale'
 *  adjustments carry reference = order_number (seed + both RPC paths). */
export function decrementedOrderNumbers(
  rows: { reference: string | null }[] | null | undefined,
): Set<string> {
  return new Set(
    (rows ?? []).map((r) => r.reference).filter((r): r is string => !!r),
  );
}

const STAGE_LABELS: Record<string, string> = {
  held: "On hold",
  "to-pick": "To pick",
  packing: "Packing",
  ready: "Ready",
  shipped: "Shipped",
  delivered: "Delivered",
};

/** Stage per ruling 4. Cancelled/refunded use the terminal 'delivered'
 *  bucket with an honest stageLabel (the view union has no other
 *  terminal stage; open-set membership is governed by stage). */
export function deriveStage(row: ShopOrder): { stage: OrderStage; stageLabel: string } {
  if (row.status === "cancelled") return { stage: "delivered", stageLabel: "Cancelled" };
  if (row.status === "refunded") return { stage: "delivered", stageLabel: "Refunded" };
  const fs = row.fulfillment_stage;
  if (fs && (STAGE_LABELS[fs] || fs === "to-pick")) {
    return { stage: fs as OrderStage, stageLabel: STAGE_LABELS[fs] ?? fs };
  }
  switch (row.status) {
    case "fulfilled":
      return { stage: "shipped", stageLabel: "Shipped" };
    case "paid":
      return { stage: "to-pick", stageLabel: "To pick" };
    case "failed":
      return { stage: "held", stageLabel: "Payment failed" };
    default:
      return { stage: "held", stageLabel: "On hold" };
  }
}

export function mapPaymentStatus(row: ShopOrder): PaymentStatus {
  const refund = deriveRefundStatus(cents(row.refunded_total), cents(row.total));
  if (refund) return refund;
  switch (row.payment_status) {
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially-refunded";
    case "void":
      // No money moved and none failed — the order was voided/cancelled.
      return "pending";
    default:
      return "pending";
  }
}

export interface OrderMapContext {
  now: Date;
  customerNameById: Map<string, string>;
  itemsByOrder: Map<string, ShopOrderItem[]>;
  eventsByOrder: Map<string, ShopOrderEvent[]>;
  /** variant_id → shelf (00012), when known. */
  shelfByVariant: Map<string, string | null>;
  /** variant_id → inventory info, for the real stock-shortage signal. */
  inventoryByVariant: Map<string, InventoryInfo>;
}

export function mapOrderRow(row: ShopOrder, ctx: OrderMapContext): Order {
  const items = ctx.itemsByOrder.get(row.id) ?? [];
  const channel: Order["channel"] = row.source === "manual" ? "counter" : "online";
  const paymentStatus = mapPaymentStatus(row);
  const totalCents = cents(row.total);
  const refundedCents = cents(row.refunded_total);

  /* Holds from real signals only (ruling 5), priority:
   * payment-failed > stock-shortage > payment-pending. */
  let hold: Order["hold"] = null;
  const openish = row.status === "pending" || row.status === "paid";
  if (openish && row.payment_status === "failed") {
    hold = {
      kind: "payment",
      tone: "problem",
      title: "Payment failed",
      reason:
        "The payment for this order failed. No stock was deducted for the failed charge; add a note, cancel the order, or refund if any amount was captured.",
    };
  } else if (openish) {
    for (const item of items) {
      if (!item.variant_id) continue;
      const inv = ctx.inventoryByVariant.get(item.variant_id);
      if (!inv) continue;
      const available = inv.onHand + inv.reserved - inv.committed;
      if (available < item.quantity) {
        hold = {
          kind: "stock",
          tone: "tape",
          title: "Stock hold",
          reason: `${item.product_title}: only ${Math.max(available, 0)} available against ${item.quantity} ordered. Recount the line before this order is released.`,
          sku: item.sku,
          shelf: ctx.shelfByVariant.get(item.variant_id) ?? undefined,
          systemCount: inv.onHand + inv.reserved,
        };
        break;
      }
    }
    if (!hold && row.payment_status === "pending" && channel !== "counter") {
      hold = {
        kind: "payment",
        tone: "tape",
        title: "Payment pending",
        reason: "Payment has not completed for this order yet.",
      };
    }
  }

  let { stage, stageLabel } = deriveStage(row);
  if (hold && stage === "to-pick") stage = "held";
  if (hold) stageLabel = hold.title;

  const placed = new Date(row.created_at);
  const placedDay = placedDayOf(row.created_at, ctx.now);
  const addr = (row.shipping_address ?? null) as Record<string, unknown> | null;
  const shipTo = addr
    ? [
        typeof addr.name === "string" ? addr.name : null,
        typeof addr.line1 === "string" ? addr.line1 : null,
        typeof addr.city === "string" ? addr.city : null,
        typeof addr.region === "string" ? addr.region : null,
        typeof addr.postal_code === "string" ? addr.postal_code : null,
      ]
        .filter(Boolean)
        .join(", ") || undefined
    : undefined;

  const events = [...(ctx.eventsByOrder.get(row.id) ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return {
    uuid: row.id,
    id: row.order_number,
    customerSlug: row.customer_id,
    customerName:
      (row.customer_id && ctx.customerNameById.get(row.customer_id)) ||
      (addr && typeof addr.name === "string" ? addr.name : null) ||
      "Storefront customer",
    placedLabel: `${fullDateFmt.format(placed)} at ${timeFmt.format(placed)}`,
    placedDay,
    channel,
    stage,
    stageLabel,
    shipByLabel:
      isOpenOrder({ stage } as Order) && placedDay === "today"
        ? CUTOFF_LABEL
        : monthDayFmt.format(placed),
    shipByMinutes:
      isOpenOrder({ stage } as Order) && placedDay === "today" ? 14 * 60 : null,
    lines: items.map((i) => ({
      sku: i.sku,
      label: i.variant_title ? `${i.product_title} — ${i.variant_title}` : i.product_title,
      qty: i.quantity,
      unitPriceCents: cents(i.unit_price),
      shelf:
        (i.variant_id ? ctx.shelfByVariant.get(i.variant_id) : null) ?? undefined,
    })),
    subtotalCents: cents(row.subtotal),
    shippingCents: cents(row.shipping_total),
    taxCents: cents(row.tax_total),
    totalCents,
    paymentStatus,
    payment:
      row.payment_status === "failed"
        ? { status: "failed" }
        : paymentStatus === "paid" ||
            paymentStatus === "partially-refunded" ||
            paymentStatus === "refunded"
          ? {
              status: "paid",
              refundableCents: Math.max(totalCents - refundedCents, 0),
              receivedCents: totalCents,
            }
          : undefined,
    hold,
    refundedCents,
    shipTo,
    history: events.map((e) => ({
      timeLabel: timeFmt.format(new Date(e.created_at)),
      text: e.message,
    })),
  };
}

export interface ProductMapContext {
  now: Date;
  categoryNameById: Map<string, string>;
  inventoryByVariant: Map<string, InventoryInfo>;
  sold30dByVariant: Map<string, number>;
  incomingByVariant: Map<
    string,
    { qty: number; dayLabel: string; poId: string }
  >;
}

export function mapProductRow(
  product: {
    id: string;
    title: string;
    slug: string;
    description: string;
    category_id: string | null;
    tags: string[];
    status: string;
  },
  variants: ShopVariant[],
  ctx: ProductMapContext,
): Product {
  const status: ProductStatus =
    product.status === "published"
      ? "active"
      : product.status === "archived"
        ? "archived"
        : "draft";
  const mappedVariants = variants.map((v) => {
    const inv = ctx.inventoryByVariant.get(v.id);
    const incoming = ctx.incomingByVariant.get(v.id);
    return {
      sku: v.sku,
      label: v.title,
      shelf: v.shelf ?? "",
      onShelf: (inv?.onHand ?? 0) + (inv?.reserved ?? 0),
      committed: inv?.committed ?? 0,
      reorderPoint: inv?.threshold ?? 10,
      priceCents: cents(v.price),
      costCents: v.cost_price != null ? cents(v.cost_price) : null,
      compareAtCents: v.compare_at_price != null ? cents(v.compare_at_price) : null,
      incoming,
    };
  });
  return {
    slug: product.slug,
    name: product.title,
    collection: product.category_id
      ? (ctx.categoryNameById.get(product.category_id) ?? "Uncategorised")
      : "Uncategorised",
    status,
    priceCents: mappedVariants.length
      ? Math.min(...mappedVariants.map((v) => v.priceCents))
      : 0,
    sold30d: variants.reduce(
      (s, v) => s + (ctx.sold30dByVariant.get(v.id) ?? 0),
      0,
    ),
    storefront: product.status === "published" ? "Visible" : "Hidden",
    backorder: false,
    supplier: null,
    description: product.description || null,
    variants: mappedVariants,
  };
}

export interface CustomerMapContext {
  now: Date;
  addressByCustomer: Map<string, ShopCustomerAddress>;
  /** Mapped orders already matched to this customer. */
  orders: Order[];
  /** Discount whose code matches a customer tag (wholesale link). */
  wholesaleDiscount: Discount | null;
}

export function mapCustomerRow(
  row: ShopCustomer,
  ctx: CustomerMapContext,
): Customer {
  const name = `${row.first_name} ${row.last_name}`.trim() || row.email || "Customer";
  /* ctx.orders arrive oldest → newest (the loader sorts by created_at). */
  const spentCents = ctx.orders
    .filter((o) => o.stageLabel !== "Cancelled" && o.paymentStatus !== "failed")
    .reduce((s, o) => s + (o.totalCents - o.refundedCents), 0);
  const returns = ctx.orders.filter((o) => o.refundedCents > 0).length;
  const last = ctx.orders.length ? ctx.orders[ctx.orders.length - 1]! : null;
  const address = ctx.addressByCustomer.get(row.id);
  const addressStr = address
    ? [address.line1, address.line2, address.city, address.region, address.postal_code]
        .filter(Boolean)
        .join(", ")
    : null;
  const created = new Date(row.created_at);
  const notes = row.notes
    ? row.notes
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const m = block.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*/);
          if (m) {
            return {
              dateLabel: monthDayFmt.format(new Date(`${m[1]}T12:00:00Z`)),
              text: block.slice(m[0].length),
            };
          }
          return { dateLabel: monthDayFmt.format(created), text: block };
        })
    : [];
  const isWholesale = row.tags.some((t) => t.toLowerCase() === "wholesale");
  return {
    slug: row.id,
    name,
    initials: initialsOf(name),
    type: isWholesale ? "wholesale" : "customer",
    email: row.email ?? "",
    location: address ? `${address.city}, ${address.region}` : "",
    sinceLabel: new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIMEZONE,
      month: "long",
    }).format(created),
    sinceFullLabel: `Customer since ${monthDayFmt.format(created)}`,
    orderCount: ctx.orders.length,
    spentCents,
    returns,
    tags: row.tags,
    emailSubscribed: null,
    textSubscribed: false,
    address: addressStr,
    wholesale:
      isWholesale && ctx.wholesaleDiscount
        ? {
            discountPct: ctx.wholesaleDiscount.pct ?? 0,
            termsLabel: "",
            code: ctx.wholesaleDiscount.code,
          }
        : undefined,
    lastOrder: last
      ? { orderId: last.id, dateLabel: last.placedLabel, statusLabel: last.stageLabel }
      : null,
    waitingFor: null,
    notes,
    orderHistory: [...ctx.orders].reverse().map((o) => ({
      orderId: o.id,
      dateLabel: o.placedLabel,
      itemsLabel: o.lines.map((l) => l.label).join(", "),
      totalCents: o.totalCents,
      statusLabel: o.stageLabel,
    })),
  };
}

export function mapDiscountRow(
  row: ShopDiscount,
  redemptions: ShopDiscountRedemption[],
  now: Date,
): Discount {
  const uses = redemptions.length;
  const cutoff = now.getTime() - 30 * 86_400_000;
  const givenCents30d = redemptions
    .filter((r) => new Date(r.created_at).getTime() >= cutoff)
    .reduce((s, r) => s + cents(r.amount), 0);
  const statusInfo = deriveDiscountStatus({
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    uses,
    useLimit: row.usage_limit,
    now,
  });
  const isPercent = row.kind === "percentage";
  const value = Number(row.value);
  const starts = new Date(row.starts_at);
  const ends = row.ends_at ? new Date(row.ends_at) : null;
  const daysUntilStart = Math.ceil(
    (starts.getTime() - now.getTime()) / 86_400_000,
  );
  return {
    /* Additive console extras for the discount builder (W-PEOPLE):
     * raw DB identity, schedule and value — no label parsing. */
    id: row.id,
    uuid: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    valueCents: cents(row.value),
    dbKind: isPercent ? "percentage" : "fixed",
    rawKind: isPercent ? "percentage" : "fixed",
    code: row.code,
    kind: isPercent ? "percent" : "fixed-amount",
    pct: isPercent ? value : null,
    whatLabel: isPercent ? `${value}% off` : `$${value.toFixed(2)} off`,
    whoLabel:
      row.per_customer_limit != null
        ? `Up to ${row.per_customer_limit} use${row.per_customer_limit === 1 ? "" : "s"} per customer`
        : "Everyone",
    whenLabel: ends
      ? `${monthDayFmt.format(starts)} – ${monthDayFmt.format(ends)}`
      : "Always on",
    startsLabel: statusInfo.status === "scheduled" ? monthDayFmt.format(starts) : undefined,
    endsLabel: ends ? monthDayFmt.format(ends) : undefined,
    startsInLabel:
      statusInfo.status === "scheduled"
        ? daysUntilStart <= 0
          ? "Starts today"
          : `Starts in ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"}`
        : undefined,
    endedReasonLabel: statusInfo.endedReason ?? undefined,
    status: statusInfo.status,
    uses,
    useLimit: row.usage_limit,
    givenCents30d,
    minOrderCents: cents(row.min_order_value),
    usesPerCustomer: row.per_customer_limit ?? undefined,
  };
}

export const DB_ROLE_LABEL: Record<DbRole, TeamMember["role"]> = {
  admin: "Owner",
  warehouse: "Fulfillment",
  support: "Customer service",
};

export function mapTeamMember(
  profile: ShopProfile,
  role: DbRole,
  isYou: boolean,
): TeamMember {
  return {
    id: profile.id,
    name: profile.full_name,
    initials: initialsOf(profile.full_name || profile.email),
    email: profile.email,
    role: DB_ROLE_LABEL[role],
    lastInLabel: "",
    isYou,
    /* RPC truth (ruling 7): admin + support may refund (no DB ceiling);
     * warehouse may not refund at all. */
    refundLimitCents: role === "warehouse" ? 0 : null,
  };
}

function auditKind(action: string, table: string): AuditEntry["kind"] {
  if (table === "user_roles" || table === "profiles") return "access";
  if (/refund/.test(action) || table === "orders") return "money";
  if (/price/.test(action)) return "price";
  return "stock";
}

export function mapAuditRow(
  row: ShopAuditLog,
  actorName: string,
  opts?: { sku?: string | null },
): AuditEntry {
  const created = new Date(row.created_at);
  const before = (row.before ?? null) as Record<string, unknown> | null;
  const after = (row.after ?? null) as Record<string, unknown> | null;
  let oldValue: string | null = null;
  let newValue: string | null = null;
  if (before && after) {
    const keys = Object.keys(after).filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    );
    if (keys.length === 1) {
      oldValue = String(before[keys[0]!]);
      newValue = String(after[keys[0]!]);
    }
  }
  const amount =
    after && typeof after.amount === "number" ? after.amount : null;
  const kind = auditKind(row.action, row.table_name);
  return {
    id: `AU-${row.id}`,
    dateISO: dayKey(created),
    dayGroup: `${weekdayShortFmt.format(created)}`,
    timeLabel: time24Fmt.format(created),
    actorId: row.actor_id,
    actorName,
    /* Inventory audit rows carry the variant UUID as row_id; when the
     * caller resolved it, name the SKU so per-SKU history is filterable
     * (W-CATALOG ask) — the UUID stays for traceability. */
    text: opts?.sku
      ? `${row.action} · ${row.table_name} · ${opts.sku}`
      : `${row.action} · ${row.table_name} · ${row.row_id}`,
    kind,
    stampLabel:
      kind === "money"
        ? "Money"
        : kind === "access"
          ? "Access"
          : kind === "price"
            ? "Price"
            : "Stock",
    /* issue_order_refund records after.amount (dollars): money out is
     * negative in the drawn ledger; any other amount reads as-is. */
    moneyCents:
      amount != null
        ? row.action.includes("refund")
          ? -Math.round(amount * 100)
          : Math.round(amount * 100)
        : null,
    oldValue,
    newValue,
  };
}

export function mapPurchaseOrderRow(
  po: ShopPurchaseOrder,
  lines: ShopPurchaseOrderLine[],
): PurchaseOrder {
  const eta = po.eta ? new Date(`${po.eta}T12:00:00Z`) : new Date(po.created_at);
  return {
    id: po.id,
    supplier: po.supplier,
    dayLabel: weekdayFullFmt.format(eta),
    dateISO: po.eta ?? dayKey(new Date(po.created_at)),
    lines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
    status: po.status,
  };
}

const REASON_TEXT: Record<string, string> = {
  sale: "Sale",
  restock_received: "Restock received",
  damaged: "Damaged",
  recount: "Recount",
  return: "Return",
  cancelled_order: "Cancelled order",
  manual: "Manual adjustment",
};

export function mapMovementRow(
  adj: ShopInventoryAdjustment,
  sku: string | null,
): StockMovement {
  return {
    id: adj.id,
    timeLabel: time24Fmt.format(new Date(adj.created_at)),
    text: adj.reference
      ? `${REASON_TEXT[adj.reason] ?? adj.reason} · ${adj.reference}`
      : (REASON_TEXT[adj.reason] ?? adj.reason),
    sku,
    deltaLabel: adj.delta > 0 ? `+${adj.delta}` : `−${Math.abs(adj.delta)}`,
    kind: adj.reason,
  };
}

/* ================================================================== */
/* Fetch helpers                                                       */
/* ================================================================== */

async function fetchOrdersTolerant(
  client: AdminClient,
): Promise<ShopOrder[]> {
  const full = await client
    .from("orders")
    .select(ORDER_COLS_FULL)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!full.error) return (full.data ?? []) as unknown as ShopOrder[];
  if (isColumnError(full.error)) {
    const legacy = await client
      .from("orders")
      .select(ORDER_COLS_LEGACY)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (legacy.error) {
      console.error("[admin] orders read failed:", legacy.error.message);
      return [];
    }
    return (legacy.data ?? []) as unknown as ShopOrder[];
  }
  console.error("[admin] orders read failed:", full.error.message);
  return [];
}

async function fetchVariantsTolerant(
  client: AdminClient,
  productIds?: string[],
): Promise<ShopVariant[]> {
  const build = (cols: string) => {
    const q = client.from("product_variants").select(cols).order("position", { ascending: true });
    return productIds ? q.in("product_id", productIds) : q;
  };
  const full = await build(VARIANT_COLS_FULL);
  if (!full.error) return (full.data ?? []) as unknown as ShopVariant[];
  if (isColumnError(full.error)) {
    const legacy = await build(VARIANT_COLS_LEGACY);
    if (legacy.error) return [];
    return (legacy.data ?? []) as unknown as ShopVariant[];
  }
  return [];
}

interface LoadedOrders {
  view: Order[];
  raw: ShopOrder[];
  items: ShopOrderItem[];
}

async function loadOrders(client: AdminClient, now: Date): Promise<LoadedOrders> {
  const raw = await fetchOrdersTolerant(client);
  if (raw.length === 0) return { view: [], raw: [], items: [] };
  const ids = raw.map((o) => o.id);
  const [{ data: items }, { data: events }, { data: custs }, { data: levels }, variants, { data: sales }] =
    await Promise.all([
      client.from("order_items").select(ITEM_COLS).in("order_id", ids),
      client.from("order_events").select(EVENT_COLS).in("order_id", ids),
      client.from("customers").select("id, first_name, last_name"),
      client.from("inventory_levels").select("variant_id, quantity_on_hand, low_stock_threshold"),
      fetchVariantsTolerant(client),
      client.from("inventory_adjustments").select("reference").eq("reason", "sale").limit(10000),
    ]);
  const itemRows = (items ?? []) as unknown as ShopOrderItem[];
  const { committed, reserved } = computeCommitments(
    raw, itemRows, now, decrementedOrderNumbers(sales as { reference: string | null }[] | null),
  );
  const itemsByOrder = new Map<string, ShopOrderItem[]>();
  for (const i of itemRows) {
    const l = itemsByOrder.get(i.order_id) ?? [];
    l.push(i);
    itemsByOrder.set(i.order_id, l);
  }
  const eventsByOrder = new Map<string, ShopOrderEvent[]>();
  for (const e of (events ?? []) as unknown as ShopOrderEvent[]) {
    const l = eventsByOrder.get(e.order_id) ?? [];
    l.push(e);
    eventsByOrder.set(e.order_id, l);
  }
  const shelfByVariant = new Map<string, string | null>(
    variants.map((v) => [v.id, v.shelf ?? null]),
  );
  const inventoryByVariant = new Map<string, InventoryInfo>();
  for (const l of (levels ?? []) as { variant_id: string; quantity_on_hand: number; low_stock_threshold: number }[]) {
    inventoryByVariant.set(l.variant_id, {
      onHand: l.quantity_on_hand,
      threshold: l.low_stock_threshold,
      committed: committed.get(l.variant_id) ?? 0,
      reserved: reserved.get(l.variant_id) ?? 0,
    });
  }
  const customerNameById = new Map<string, string>(
    ((custs ?? []) as { id: string; first_name: string; last_name: string }[]).map(
      (c) => [c.id, `${c.first_name} ${c.last_name}`.trim()],
    ),
  );
  const ctx: OrderMapContext = {
    now,
    customerNameById,
    itemsByOrder,
    eventsByOrder,
    shelfByVariant,
    inventoryByVariant,
  };
  return { view: raw.map((r) => mapOrderRow(r, ctx)), raw, items: itemRows };
}

async function loadProducts(
  client: AdminClient,
  now: Date,
): Promise<{ products: Product[]; arrivingQty: number }> {
  const [{ data: prods }, { data: cats }, { data: levels }, { data: ords }, pos, { data: sales }] =
    await Promise.all([
      client
        .from("products")
        .select("id, title, slug, description, category_id, tags, status, created_at, updated_at")
        .order("created_at", { ascending: false }),
      client.from("categories").select("id, name, slug"),
      client.from("inventory_levels").select("variant_id, quantity_on_hand, low_stock_threshold"),
      client.from("orders").select("id, order_number, status, created_at"),
      fetchPurchaseOrdersRaw(client),
      client.from("inventory_adjustments").select("reference").eq("reason", "sale").limit(10000),
    ]);
  const productRows = (prods ?? []) as {
    id: string; title: string; slug: string; description: string;
    category_id: string | null; tags: string[]; status: string;
  }[];
  const variants = await fetchVariantsTolerant(
    client,
    productRows.map((p) => p.id),
  );
  let itemRows: ShopOrderItem[] = [];
  if (variants.length) {
    const { data: items } = await client
      .from("order_items")
      .select(ITEM_COLS)
      .in("variant_id", variants.map((v) => v.id));
    itemRows = (items ?? []) as unknown as ShopOrderItem[];
  }
  const orderRows = (ords ?? []) as ShopOrder[];
  const { committed, reserved, sold30d } = computeCommitments(
    orderRows, itemRows, now, decrementedOrderNumbers(sales as { reference: string | null }[] | null),
  );
  const inventoryByVariant = new Map<string, InventoryInfo>();
  for (const l of (levels ?? []) as { variant_id: string; quantity_on_hand: number; low_stock_threshold: number }[]) {
    inventoryByVariant.set(l.variant_id, {
      onHand: l.quantity_on_hand,
      threshold: l.low_stock_threshold,
      committed: committed.get(l.variant_id) ?? 0,
      reserved: reserved.get(l.variant_id) ?? 0,
    });
  }
  for (const v of variants) {
    if (!inventoryByVariant.has(v.id)) {
      inventoryByVariant.set(v.id, {
        onHand: 0,
        threshold: 10,
        committed: committed.get(v.id) ?? 0,
        reserved: reserved.get(v.id) ?? 0,
      });
    }
  }
  const variantIdBySku = new Map(variants.map((v) => [v.sku, v.id]));
  const incomingByVariant = new Map<string, { qty: number; dayLabel: string; poId: string }>();
  let arrivingQty = 0;
  const weekAhead = now.getTime() + 7 * 86_400_000;
  for (const po of pos) {
    if (po.po.status !== "open") continue;
    const etaMs = po.po.eta ? new Date(`${po.po.eta}T12:00:00Z`).getTime() : null;
    for (const line of po.lines) {
      if (etaMs != null && etaMs <= weekAhead) arrivingQty += line.qty;
      const vid = line.variant_id ?? variantIdBySku.get(line.sku);
      if (!vid) continue;
      const existing = incomingByVariant.get(vid);
      if (!existing) {
        incomingByVariant.set(vid, {
          qty: line.qty,
          dayLabel: po.po.eta ? monthDayFmt.format(new Date(`${po.po.eta}T12:00:00Z`)) : "",
          poId: po.po.id,
        });
      }
    }
  }
  const categoryNameById = new Map(
    ((cats ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const variantsByProduct = new Map<string, ShopVariant[]>();
  for (const v of variants) {
    const l = variantsByProduct.get(v.product_id) ?? [];
    l.push(v);
    variantsByProduct.set(v.product_id, l);
  }
  const ctx: ProductMapContext = {
    now,
    categoryNameById,
    inventoryByVariant,
    sold30dByVariant: sold30d,
    incomingByVariant,
  };
  return {
    products: productRows.map((p) =>
      mapProductRow(p, variantsByProduct.get(p.id) ?? [], ctx),
    ),
    arrivingQty,
  };
}

async function fetchPurchaseOrdersRaw(
  client: AdminClient,
): Promise<{ po: ShopPurchaseOrder; lines: ShopPurchaseOrderLine[] }[]> {
  const { data: pos, error } = await client
    .from("purchase_orders")
    .select("id, supplier, eta, status, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error || !pos) return []; // pre-00012: honest empty state (ruling 13)
  const rows = pos as unknown as ShopPurchaseOrder[];
  if (rows.length === 0) return [];
  const { data: lines } = await client
    .from("purchase_order_lines")
    .select("id, po_id, variant_id, sku, qty")
    .in("po_id", rows.map((p) => p.id));
  const byPo = new Map<string, ShopPurchaseOrderLine[]>();
  for (const l of (lines ?? []) as unknown as ShopPurchaseOrderLine[]) {
    const arr = byPo.get(l.po_id) ?? [];
    arr.push(l);
    byPo.set(l.po_id, arr);
  }
  return rows.map((po) => ({ po, lines: byPo.get(po.id) ?? [] }));
}

/* ================================================================== */
/* Contract reads                                                      */
/* ================================================================== */

/**
 * The console actor. NOTE: the coordinator contract writes this as
 * `TeamMember & { userId: string; role: DbRole }`, but that literal
 * intersection is `never` — TeamMember.role is the DISPLAY union
 * ("Owner" | …) while DbRole is the DB union ("admin" | …). The actor
 * therefore carries role = DbRole (what page code compares against)
 * plus displayRole = the TeamMember display role.
 */
export type ConsoleActor = Omit<TeamMember, "role"> & {
  userId: string;
  role: DbRole;
  displayRole: TeamMember["role"];
};

export async function getConsoleActor(): Promise<ConsoleActor> {
  const client = await db();
  const { data: auth } = await client.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("getConsoleActor: no signed-in user.");
  const [{ data: profile }, { data: roleData }] = await Promise.all([
    client.from("profiles").select("id, email, full_name, avatar_url, created_at, updated_at").eq("id", user.id).maybeSingle(),
    client.rpc("current_role"),
  ]);
  const role = (roleData as string | null) ?? null;
  if (role !== "admin" && role !== "warehouse" && role !== "support") {
    throw new Error("getConsoleActor: signed-in user has no staff role.");
  }
  const prof = (profile ?? {
    id: user.id,
    email: user.email ?? "",
    full_name: user.email ?? "Staff member",
    avatar_url: null,
    created_at: "",
    updated_at: "",
  }) as ShopProfile;
  const member = mapTeamMember(prof, role, true);
  return { ...member, userId: user.id, role, displayRole: member.role };
}

export async function getConsoleCounts(): Promise<{
  heldOrders: number;
  lowStockSkus: number;
}> {
  const client = await db();
  const now = new Date();
  const [{ view }, { products }] = await Promise.all([
    loadOrders(client, now),
    loadProducts(client, now),
  ]);
  const skus = deriveListSkus(products);
  return {
    heldOrders: deriveHeldOrders(view).length,
    lowStockSkus: inventorySummary(skus).belowReorder,
  };
}

export async function listConsoleOrders(): Promise<Order[]> {
  const client = await db();
  const { view } = await loadOrders(client, new Date());
  return view;
}

export async function getConsoleOrder(
  idOrNumber: string,
): Promise<Order | undefined> {
  const client = await db();
  const now = new Date();
  const { view } = await loadOrders(client, now);
  return view.find(
    (o) => o.uuid === idOrNumber || o.id === idOrNumber.toUpperCase(),
  );
}

export async function listConsoleProducts(): Promise<Product[]> {
  const client = await db();
  const { products } = await loadProducts(client, new Date());
  return products;
}

export async function getConsoleProduct(
  slug: string,
): Promise<Product | undefined> {
  const list = await listConsoleProducts();
  return list.find((p) => p.slug === slug);
}

export async function listConsoleSkus(): Promise<Sku[]> {
  return deriveListSkus(await listConsoleProducts());
}

async function loadCustomers(client: AdminClient, now: Date): Promise<Customer[]> {
  const [{ data: custs }, { data: addrs }, { data: discs }, loaded] =
    await Promise.all([
      client
        .from("customers")
        .select("id, first_name, last_name, email, phone, tags, notes, created_at, updated_at")
        .order("created_at", { ascending: false }),
      client
        .from("customer_addresses")
        .select("id, customer_id, label, line1, line2, city, region, postal_code, country, is_default"),
      client
        .from("discounts")
        .select("id, code, kind, value, usage_limit, per_customer_limit, min_order_value, starts_at, ends_at, status, created_by, created_at"),
      loadOrders(client, now),
    ]);
  const custRows = (custs ?? []) as unknown as ShopCustomer[];
  const addressByCustomer = new Map<string, ShopCustomerAddress>();
  for (const a of (addrs ?? []) as unknown as ShopCustomerAddress[]) {
    const existing = addressByCustomer.get(a.customer_id);
    if (!existing || (a.is_default && !existing.is_default)) {
      addressByCustomer.set(a.customer_id, a);
    }
  }
  /* created_by → email, for matching storefront orders (ruling 9). */
  const { data: profiles } = await client
    .from("profiles")
    .select("id, email, full_name, avatar_url, created_at, updated_at");
  const emailByProfile = new Map(
    ((profiles ?? []) as unknown as ShopProfile[]).map((p) => [p.id, p.email.toLowerCase()]),
  );
  const rawByUuid = new Map(loaded.raw.map((r) => [r.id, r]));
  const discountRows = (discs ?? []) as unknown as ShopDiscount[];
  const mappedDiscounts = discountRows.map((d) => mapDiscountRow(d, [], now));

  return custRows.map((c) => {
    const matched = loaded.view.filter((o) => {
      if (o.customerSlug === c.id) return true;
      const raw = rawByUuid.get(o.uuid);
      if (raw && raw.customer_id == null && raw.created_by && c.email) {
        return emailByProfile.get(raw.created_by) === c.email.toLowerCase();
      }
      return false;
    });
    /* Chronological for history/last-order honesty: sort by created_at. */
    const rawSorted = [...matched].sort((a, b) => {
      const ra = rawByUuid.get(a.uuid);
      const rb = rawByUuid.get(b.uuid);
      return (ra?.created_at ?? "").localeCompare(rb?.created_at ?? "");
    });
    const wholesaleDiscount =
      mappedDiscounts.find((d) =>
        c.tags.some((t) => t.toUpperCase() === d.code),
      ) ?? null;
    return mapCustomerRow(c, {
      now,
      addressByCustomer,
      orders: rawSorted,
      wholesaleDiscount,
    });
  });
}

export async function listConsoleCustomers(): Promise<Customer[]> {
  const client = await db();
  return loadCustomers(client, new Date());
}

export async function getConsoleCustomer(
  id: string,
): Promise<Customer | undefined> {
  const list = await listConsoleCustomers();
  return list.find((c) => c.slug === id);
}

/** Contract: totals over the mapped list. Pass the orders list too when
 *  available so openOrders is real; otherwise it is 0 (not derivable
 *  from Customer rows alone). */
export function consoleCustomersTotals(
  list: Customer[],
  orders?: Order[],
): CustomersTotals {
  return customersTotalsFrom(
    list,
    orders ? orders.filter(isOpenOrder).length : 0,
  );
}

async function loadDiscounts(
  client: AdminClient,
  now: Date,
): Promise<{ list: Discount[]; ordersCents30d: number }> {
  const [{ data: discs }, { data: reds }] = await Promise.all([
    client
      .from("discounts")
      .select("id, code, kind, value, usage_limit, per_customer_limit, min_order_value, starts_at, ends_at, status, created_by, created_at")
      .order("created_at", { ascending: false }),
    client
      .from("discount_redemptions")
      .select("id, discount_id, order_id, customer_id, amount, created_at"),
  ]);
  const rows = (discs ?? []) as unknown as ShopDiscount[];
  const redRows = (reds ?? []) as unknown as ShopDiscountRedemption[];
  const byDiscount = new Map<string, ShopDiscountRedemption[]>();
  for (const r of redRows) {
    const l = byDiscount.get(r.discount_id) ?? [];
    l.push(r);
    byDiscount.set(r.discount_id, l);
  }
  const cutoff = now.getTime() - 30 * 86_400_000;
  const recentOrderIds = [
    ...new Set(
      redRows
        .filter((r) => new Date(r.created_at).getTime() >= cutoff)
        .map((r) => r.order_id),
    ),
  ];
  let ordersCents30d = 0;
  if (recentOrderIds.length) {
    const { data: ords } = await client
      .from("orders")
      .select("id, total")
      .in("id", recentOrderIds);
    ordersCents30d = ((ords ?? []) as { total: string | number }[]).reduce(
      (s, o) => s + cents(o.total),
      0,
    );
  }
  return {
    list: rows.map((d) => mapDiscountRow(d, byDiscount.get(d.id) ?? [], now)),
    ordersCents30d,
  };
}

export async function listConsoleDiscounts(): Promise<Discount[]> {
  const client = await db();
  const { list } = await loadDiscounts(client, new Date());
  return list;
}

export async function getConsoleDiscount(
  code: string,
): Promise<Discount | undefined> {
  const list = await listConsoleDiscounts();
  return list.find((d) => d.code === code.toUpperCase());
}

export function consoleDiscountsTotals(
  list: Discount[],
  ordersCents30d = 0,
): DiscountTotals {
  return discountsTotalsFrom(list, ordersCents30d);
}

/** Real totals incl. the 30-day discounted-orders denominator. */
export async function getConsoleDiscountsTotals(): Promise<DiscountTotals> {
  const client = await db();
  const { list, ordersCents30d } = await loadDiscounts(client, new Date());
  return discountsTotalsFrom(list, ordersCents30d);
}

export async function listConsoleAudit(limit = 100): Promise<AuditList> {
  const client = await db();
  const [{ data: rows }, { count }, { data: profiles }] = await Promise.all([
    client
      .from("audit_log")
      .select("id, actor_id, action, table_name, row_id, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("audit_log")
      .select("id", { count: "exact", head: true }),
    client.from("profiles").select("id, email, full_name, avatar_url, created_at, updated_at"),
  ]);
  const nameById = new Map(
    ((profiles ?? []) as unknown as ShopProfile[]).map((p) => [p.id, p.full_name]),
  );
  /* Resolve variant UUID row_ids (inventory audit rows) to SKUs. */
  const rawRows = (rows ?? []) as unknown as ShopAuditLog[];
  const variantIds = [
    ...new Set(rawRows.map((r) => r.row_id).filter((id) => isUuid(id))),
  ];
  const skuByVariant = new Map<string, string>();
  if (variantIds.length) {
    const { data: vars } = await client
      .from("product_variants")
      .select("id, sku")
      .in("id", variantIds);
    for (const v of (vars ?? []) as { id: string; sku: string }[]) {
      skuByVariant.set(v.id, v.sku);
    }
  }
  const entries = rawRows.map((r) =>
    mapAuditRow(r, r.actor_id ? (nameById.get(r.actor_id) ?? "Staff") : "System", {
      sku: skuByVariant.get(r.row_id) ?? null,
    }),
  );
  /* Day-group headers as drawn: "Today · Tue, Oct 6" style. */
  const now = new Date();
  for (const e of entries) {
    const d = new Date(`${e.dateISO}T12:00:00Z`);
    const label = weekdayShortFmt.format(d);
    e.dayGroup =
      e.dateISO === dayKey(now)
        ? `Today · ${label}`
        : e.dateISO === shiftDayKey(dayKey(now), -1)
          ? `Yesterday · ${label}`
          : label;
  }
  return {
    entries,
    totalCount: count ?? entries.length,
    shownCount: entries.length,
  };
}

export async function listConsoleTeam(): Promise<TeamMember[]> {
  const client = await db();
  const [{ data: profiles }, { data: roles }, { data: auth }] =
    await Promise.all([
      client.from("profiles").select("id, email, full_name, avatar_url, created_at, updated_at"),
      client.from("user_roles").select("user_id, role, granted_at, granted_by"),
      client.auth.getUser(),
    ]);
  const roleByUser = new Map(
    ((roles ?? []) as unknown as ShopUserRole[]).map((r) => [r.user_id, r.role]),
  );
  const me = auth.user?.id;
  return ((profiles ?? []) as unknown as ShopProfile[])
    .filter((p) => roleByUser.has(p.id))
    .map((p) =>
      mapTeamMember(p, roleByUser.get(p.id) as DbRole, p.id === me),
    );
}

export async function getConsoleStoreSettings(): Promise<{
  taxRatePct: number;
  shippingFlatCents: number;
  freeShipThresholdCents: number | null;
}> {
  const client = await db();
  const { data } = await client.from("store_settings").select("key, value, updated_at");
  const byKey = new Map(
    ((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]),
  );
  const num = (v: unknown): number | null =>
    typeof v === "number" ? v : v == null ? null : Number(v);
  const taxRate = num(byKey.get("tax_rate")) ?? 0;
  const ship = num(byKey.get("shipping_flat")) ?? 0;
  const threshold = num(byKey.get("free_shipping_threshold"));
  return {
    taxRatePct: Math.round(taxRate * 10000) / 100,
    shippingFlatCents: Math.round(ship * 100),
    freeShipThresholdCents: threshold == null ? null : Math.round(threshold * 100),
  };
}

export async function listConsolePurchaseOrders(): Promise<PurchaseOrder[]> {
  const client = await db();
  const raw = await fetchPurchaseOrdersRaw(client);
  return raw.map(({ po, lines }) => mapPurchaseOrderRow(po, lines));
}

export async function todaysMovements(): Promise<StockMovement[]> {
  const client = await db();
  const now = new Date();
  const { data: adjs } = await client
    .from("inventory_adjustments")
    .select("id, variant_id, delta, quantity_before, quantity_after, reason, reference, note, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = ((adjs ?? []) as unknown as ShopInventoryAdjustment[]).filter(
    (a) => dayKey(new Date(a.created_at)) === dayKey(now),
  );
  if (rows.length === 0) return [];
  const variants = await fetchVariantsTolerant(client);
  const skuByVariant = new Map(variants.map((v) => [v.id, v.sku]));
  return rows.map((a) => mapMovementRow(a, skuByVariant.get(a.variant_id) ?? null));
}

export async function getDashboard(): Promise<DashboardData> {
  const client = await db();
  const now = new Date();
  const [{ view }, { products, arrivingQty }] = await Promise.all([
    loadOrders(client, now),
    loadProducts(client, now),
  ]);
  const skus = deriveListSkus(products);

  /* Revenue per shop day needs raw created_at (the view's placedLabel
   * is display-only), so group from a light raw query over 14 days. */
  const { data: recent } = await client
    .from("orders")
    .select("id, created_at, total, refunded_total, payment_status")
    .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString());
  const dayStats = new Map<string, { orders: number; revenueCents: number }>();
  for (const r of (recent ?? []) as {
    created_at: string;
    total: string | number;
    refunded_total: string | number;
    payment_status: string;
  }[]) {
    if (
      r.payment_status !== "paid" &&
      r.payment_status !== "partially_refunded" &&
      r.payment_status !== "refunded"
    ) {
      continue;
    }
    const key = dayKey(new Date(r.created_at));
    const cur = dayStats.get(key) ?? { orders: 0, revenueCents: 0 };
    cur.orders += 1;
    cur.revenueCents += cents(r.total) - cents(r.refunded_total);
    dayStats.set(key, cur);
  }
  const days: RevenueDay[] = [];
  let prevRevenueCents = 0;
  let prevOrders = 0;
  for (let i = 13; i >= 7; i--) {
    const key = shiftDayKey(dayKey(now), -i);
    const s = dayStats.get(key);
    if (s) {
      prevRevenueCents += s.revenueCents;
      prevOrders += s.orders;
    }
  }
  for (let i = 6; i >= 0; i--) {
    const key = shiftDayKey(dayKey(now), -i);
    const d = new Date(`${key}T12:00:00Z`);
    const s = dayStats.get(key) ?? { orders: 0, revenueCents: 0 };
    days.push({
      dateISO: key,
      dateLabel: monthDayFmt.format(d),
      dayLabel: i === 0 ? "Today" : String(Number(key.slice(8, 10))),
      orders: s.orders,
      revenueCents: s.revenueCents,
    });
  }
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return dashboardFromData({
    orders: view,
    skus,
    days,
    shop: {
      days,
      prevRevenueCents,
      prevOrders,
      todayLabel: weekdayShortFmt.format(now),
      dayHeroLabel: weekdayFullFmt.format(now),
      cutoffLabel: CUTOFF_LABEL,
      rangeLabel: `${first.dateLabel} – ${last.dateLabel}`,
      arrivingQty,
      sold30dBySlug: Object.fromEntries(
        products.map((p) => [p.slug, p.sold30d]),
      ),
    },
  });
}
