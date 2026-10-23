/* Pure derivations over the src/lib/types.ts view shapes.
 *
 * Extracted from src/lib/api.ts (ruling 2): this module imports NO
 * fixture data, so server code (src/lib/shop/admin.ts) can derive every
 * displayed number from real DB-mapped view models. src/lib/api.ts
 * re-exports these over the fixture store for legacy consumers.
 *
 * Where the fixture versions read shop.json constants (dashboard labels,
 * last-7-days series, arriving quantities), the values arrive here as
 * parameters instead.
 */
import type {
  Customer,
  CustomersTotals,
  DashboardData,
  DashboardException,
  Discount,
  DiscountTotals,
  InventorySummary,
  Order,
  OrdersSummary,
  Product,
  RevenueDay,
  Sku,
} from "./types";

/* ---------------- stock helpers ---------------- */

/** Available = on shelf − committed to open orders. */
export function availableOf(v: { onShelf: number; committed: number }): number {
  return v.onShelf - v.committed;
}

export function isBelowReorder(v: {
  onShelf: number;
  committed: number;
  reorderPoint: number;
}): boolean {
  return availableOf(v) < v.reorderPoint;
}

/** SKUs in stock scope: archived products are not counted in tallies. */
export function liveSkus(skus: Sku[]): Sku[] {
  return skus.filter((s) => s.productStatus !== "archived");
}

/* ---------------- catalogue & inventory ---------------- */

export function listSkus(list: Product[]): Sku[] {
  return list.flatMap((p) =>
    p.variants.map((v) => ({
      ...v,
      productSlug: p.slug,
      productName: p.name,
      collection: p.collection,
      productStatus: p.status,
      backorder: p.backorder,
    })),
  );
}

/** Signature per the console contract: getSku(list, code). */
export function getSku(list: Product[], code: string): Sku | undefined {
  return listSkus(list).find((s) => s.sku === code);
}

export function inventorySummary(skus: Sku[], arrivingQty = 0): InventorySummary {
  const live = liveSkus(skus);
  return {
    belowReorder: live.filter(isBelowReorder).length,
    atZero: live.filter((s) => availableOf(s) === 0).length,
    countPending: live.filter((s) => s.countPending).length,
    totalSkus: skus.length,
    onHand: skus.reduce((sum, s) => sum + s.onShelf, 0),
    committed: skus.reduce((sum, s) => sum + s.committed, 0),
    arrivingThisWeek: arrivingQty,
  };
}

/** Products (not SKUs) with at least one variant below its reorder point. */
export function restockProductCount(list: Product[]): number {
  return list.filter(
    (p) => p.status !== "archived" && p.variants.some(isBelowReorder),
  ).length;
}

/* ---------------- orders ---------------- */

const OPEN_STAGES = ["held", "to-pick", "packing", "ready"] as const;

export function isOpenOrder(o: Order): boolean {
  return (OPEN_STAGES as readonly string[]).includes(o.stage);
}

export function ordersSummary(list: Order[]): OrdersSummary {
  const open = list.filter(isOpenOrder);
  const fulfill = open.filter((o) => !o.hold);
  return {
    openCount: open.length,
    openTotalCents: open.reduce((s, o) => s + o.totalCents, 0),
    heldCount: open.filter((o) => o.hold).length,
    toFulfillCount: fulfill.length,
    pickCount: fulfill.filter((o) => o.stage === "to-pick").length,
    packCount: fulfill.filter((o) => o.stage === "packing").length,
    readyCount: fulfill.filter((o) => o.stage === "ready").length,
    shippedTodayCount: list.filter(
      (o) => o.stage === "shipped" && o.placedDay === "today",
    ).length,
    refundsCount: list.filter(
      (o) =>
        o.paymentStatus === "partially-refunded" ||
        o.paymentStatus === "refund-requested" ||
        !!o.refundRequest,
    ).length,
  };
}

export function heldOrders(list: Order[]): Order[] {
  return list.filter((o) => isOpenOrder(o) && o.hold);
}

/**
 * Payment-status truth from money (ruling: refund status derivation).
 * refunded >= total (and total > 0) → 'refunded'; any partial refund →
 * 'partially-refunded'; otherwise null (keep the stored status).
 */
export function deriveRefundStatus(
  refundedCents: number,
  totalCents: number,
): "refunded" | "partially-refunded" | null {
  if (refundedCents <= 0) return null;
  if (totalCents > 0 && refundedCents >= totalCents) return "refunded";
  return "partially-refunded";
}

/* ---------------- dashboard ---------------- */

const TONE_RANK: Record<string, number> = {
  problem: 0,
  tape: 1,
  ink: 2,
  slate: 3,
  paid: 4,
  muted: 5,
};

export interface DashboardContext {
  /** The last-7-days series, oldest → newest (today last). */
  days: RevenueDay[];
  /** Previous 7 days' revenue/orders, for the change figures. */
  prevRevenueCents?: number;
  prevOrders?: number;
  todayLabel: string;
  dayHeroLabel: string;
  cutoffLabel: string;
  rangeLabel: string;
  /** Units arriving this week (open purchase orders due ≤ 7 days). */
  arrivingQty?: number;
  /** Inventory-watch SKU codes, in display order. Defaults to the four
   *  lowest-available live SKUs when the caller passes none. */
  watchSkus?: string[];
  /** sold30d lookup by product slug, for stock-exception copy. */
  sold30dBySlug?: Record<string, number>;
}

export function dashboardFromData(input: {
  orders: Order[];
  skus: Sku[];
  days: RevenueDay[];
  shop: DashboardContext;
}): DashboardData {
  const { orders: list, skus, days, shop } = input;
  const summary = ordersSummary(list);
  const inv = inventorySummary(skus, shop.arrivingQty ?? 0);

  const exceptions: DashboardException[] = heldOrders(list).map((o) => ({
    id: `EX-${o.id}`,
    kind: "order" as const,
    tone: o.hold!.tone,
    orderId: o.id,
    sku: o.hold!.sku ?? o.lines[0]?.sku ?? null,
    stampLabel: o.hold!.title,
    title: `${o.customerName} · ${o.lines.reduce((s, l) => s + l.qty, 0)} item${
      o.lines.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"
    } · $${(o.totalCents / 100).toFixed(2)}`,
    reason: o.hold!.reason,
    codesLabel: o.lines.map((l) => `${l.sku} ×${l.qty}`).join(" · "),
    actorLabel: o.hold!.countedBy
      ? `${o.hold!.countedBy} · ${o.hold!.flaggedAtLabel ?? o.hold!.countedAtLabel}`
      : null,
  }));

  /* Sold-out variant exceptions, drawn as their own rows. */
  for (const s of liveSkus(skus).filter((x) => availableOf(x) === 0)) {
    exceptions.push({
      id: `EX-${s.sku}`,
      kind: "stock",
      tone: "problem",
      orderId: null,
      sku: s.sku,
      stampLabel: "Out of stock",
      title: `${s.productName} — ${s.label}`,
      reason: `${availableOf(s)} on hand against a reorder point of ${s.reorderPoint}. The storefront shows it as sold out; ${s.committed} paid orders are reserved from the last delivery.`,
      codesLabel: `${shop.sold30dBySlug?.[s.productSlug] ?? 0} sold in 30 days · ${s.incoming?.qty ?? 0} arriving`,
      actorLabel: null,
    });
  }
  /* Exceptions lead, sorted problem-first, then tape-ink. */
  exceptions.sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9));

  const queue = list
    .filter((o) => isOpenOrder(o) && !o.hold)
    .sort((a, b) => (a.shipByMinutes ?? 9999) - (b.shipByMinutes ?? 9999));

  const belowSafety = liveSkus(skus).filter(
    (s) => s.safetyPoint != null && availableOf(s) <= s.safetyPoint,
  ).length;

  const revenueCents = days.reduce((s, d) => s + d.revenueCents, 0);
  const ordersCount = days.reduce((s, d) => s + d.orders, 0);
  const revenueChangePct =
    shop.prevRevenueCents != null && shop.prevRevenueCents > 0
      ? Math.round(((revenueCents - shop.prevRevenueCents) / shop.prevRevenueCents) * 1000) / 10
      : 0;
  const ordersVsLastWeek =
    shop.prevOrders != null ? ordersCount - shop.prevOrders : 0;

  const watchCodes =
    shop.watchSkus ??
    [...liveSkus(skus)]
      .sort((a, b) => availableOf(a) - availableOf(b))
      .slice(0, 4)
      .map((s) => s.sku);

  return {
    todayLabel: shop.todayLabel,
    dayHeroLabel: shop.dayHeroLabel,
    cutoffLabel: shop.cutoffLabel,
    pipeline: {
      shipped: summary.shippedTodayCount,
      ready: summary.readyCount,
      packing: summary.packCount,
      toPick: summary.pickCount,
    },
    toGoToday: summary.toFulfillCount,
    exceptions,
    moreHeldCount: Math.max(0, exceptions.length - 4),
    fulfillmentQueue: queue,
    fulfillmentTotal: summary.toFulfillCount,
    ledger7: {
      rangeLabel: shop.rangeLabel,
      revenueCents,
      revenueChangePct,
      orders: ordersCount,
      ordersVsLastWeek,
      heldOrders: summary.heldCount,
      lowStockSkus: inv.belowReorder,
      belowSafety,
      atZero: inv.atZero,
      revenueByDay: days,
      peakCents: days.length ? Math.max(...days.map((d) => d.revenueCents)) : 0,
    },
    inventoryWatch: watchCodes
      .map((code) => skus.find((s) => s.sku === code))
      .filter((s): s is Sku => !!s),
  };
}

/* ---------------- customers ---------------- */

/** Average order value in cents, rounded — $614 / 6 = $102.33. */
export function averageOrderCents(c: Customer): number {
  return c.orderCount === 0 ? 0 : Math.round(c.spentCents / c.orderCount);
}

/**
 * Customers totals derived from the mapped list itself.
 * `openOrderCount` cannot be derived from Customer rows (no per-customer
 * open count in the view shape) — the caller passes it when it has the
 * orders; it defaults to 0.
 */
export function customersTotalsFrom(
  list: Customer[],
  openOrderCount = 0,
): CustomersTotals {
  return {
    total: list.length,
    returning: list.filter((c) => c.orderCount > 1).length,
    waitingOnRestock: list.filter((c) => c.waitingFor != null).length,
    wholesale: list.filter((c) => c.type === "wholesale").length,
    openOrders: openOrderCount,
  };
}

/* ---------------- discounts ---------------- */

/**
 * Discount status derivation (ruling 10): a paused discount reports
 * status 'ended' with `paused: true` so the UI stamp slot can show
 * "Paused" copy instead of claiming it ended.
 */
export function deriveDiscountStatus(input: {
  status: string;
  startsAt: string;
  endsAt: string | null;
  uses: number;
  useLimit: number | null;
  now: Date;
}): { status: Discount["status"]; paused: boolean; endedReason: string | null } {
  const nowMs = input.now.getTime();
  if (input.status === "paused") {
    return { status: "ended", paused: true, endedReason: "Paused" };
  }
  if (input.useLimit != null && input.uses >= input.useLimit) {
    return {
      status: "ended",
      paused: false,
      endedReason: `Ended at its ${input.useLimit}-use limit`,
    };
  }
  if (input.endsAt && new Date(input.endsAt).getTime() < nowMs) {
    return { status: "ended", paused: false, endedReason: "Ended" };
  }
  if (new Date(input.startsAt).getTime() > nowMs) {
    return { status: "scheduled", paused: false, endedReason: null };
  }
  return { status: "running", paused: false, endedReason: null };
}

/**
 * Discount totals derived from the mapped list. `ordersCents30d` (the
 * value of orders that used a discount in 30 days) has no per-discount
 * view field, so the caller passes it when known; avgPct is 0 when the
 * denominator is unknown/zero rather than an invented figure.
 */
export function discountsTotalsFrom(
  list: Discount[],
  ordersCents30d = 0,
): DiscountTotals {
  const givenCents30d = list.reduce((s, d) => s + d.givenCents30d, 0);
  return {
    givenCents30d,
    ordersCents30d,
    avgPct:
      ordersCents30d > 0
        ? Math.round((givenCents30d / ordersCents30d) * 1000) / 10
        : 0,
  };
}
