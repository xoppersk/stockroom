/* Pure read API over the typed fixtures (HANDOVER §3/§9).
   Every number a screen shows is derived here from src/data/*.json —
   nothing is restated. Mutations live in lib/store.tsx. */
import shopJson from "@/data/shop.json";
import teamJson from "@/data/team.json";
import productsJson from "@/data/products.json";
import ordersJson from "@/data/orders.json";
import customersJson from "@/data/customers.json";
import discountsJson from "@/data/discounts.json";
import purchaseOrdersJson from "@/data/purchase-orders.json";
import auditJson from "@/data/audit.json";
import movementsJson from "@/data/movements.json";
import settingsJson from "@/data/settings.json";
import type {
  AuditList, Customer, CustomersTotals, DashboardData, DashboardException, Discount,
  DiscountTotals, InventorySummary, Order, OrdersSummary, PermissionRow, Product,
  PurchaseOrder, RevenueDay, Shop, ShopSettings, Sku, StockMovement, TeamInvite, TeamMember,
} from "./types";

export const shop = shopJson as unknown as Shop;
export const products = productsJson.products as unknown as Product[];
export const orders = ordersJson.orders as unknown as Order[];
export const customers = customersJson.customers as unknown as Customer[];
export const discounts = discountsJson.discounts as unknown as Discount[];
export const purchaseOrders = purchaseOrdersJson.purchaseOrders as unknown as PurchaseOrder[];

/* ---------------- stock helpers ---------------- */

/** Available = on shelf − committed to paid orders (§10). */
export function availableOf(v: { onShelf: number; committed: number }): number {
  return v.onShelf - v.committed;
}

export function isBelowReorder(v: { onShelf: number; committed: number; reorderPoint: number }): boolean {
  return availableOf(v) < v.reorderPoint;
}

/** SKUs in stock scope: archived products (the discontinued opener) are not
    counted in the inventory tallies, matching the drawn "At zero 1". */
function liveSkus(skus: Sku[]): Sku[] {
  return skus.filter((s) => s.productStatus !== "archived");
}

/* ---------------- shop / team ---------------- */

export function getShop(): Shop {
  return shop;
}

export function getTeam(): { members: TeamMember[]; invite: TeamInvite } {
  return teamJson as unknown as { members: TeamMember[]; invite: TeamInvite };
}

export function getPermissionMatrix(): PermissionRow[] {
  return (teamJson as unknown as { permissionMatrix: PermissionRow[] }).permissionMatrix;
}

/* ---------------- catalogue & inventory ---------------- */

export function listProducts(): Product[] {
  return products;
}

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function listSkus(list: Product[] = products): Sku[] {
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

export function getSku(code: string, list: Product[] = products): Sku | undefined {
  return listSkus(list).find((s) => s.sku === code);
}

export function inventorySummary(skus: Sku[] = listSkus()): InventorySummary {
  const live = liveSkus(skus);
  return {
    belowReorder: live.filter(isBelowReorder).length,
    atZero: live.filter((s) => availableOf(s) === 0).length,
    countPending: live.filter((s) => s.countPending).length,
    totalSkus: skus.length,
    onHand: skus.reduce((sum, s) => sum + s.onShelf, 0),
    committed: skus.reduce((sum, s) => sum + s.committed, 0),
    arrivingThisWeek: purchaseOrders.reduce(
      (sum, po) => sum + po.lines.reduce((s, l) => s + l.qty, 0),
      0,
    ),
  };
}

/** Products (not SKUs) with at least one variant below its reorder point. */
export function restockProductCount(list: Product[] = products): number {
  return list.filter(
    (p) => p.status !== "archived" && p.variants.some(isBelowReorder),
  ).length;
}

export function listPurchaseOrders(): PurchaseOrder[] {
  return purchaseOrders;
}

export function todaysMovements(): StockMovement[] {
  return movementsJson.movements as unknown as StockMovement[];
}

/* ---------------- orders ---------------- */

const OPEN_STAGES = ["held", "to-pick", "packing", "ready"] as const;

export function isOpenOrder(o: Order): boolean {
  return (OPEN_STAGES as readonly string[]).includes(o.stage);
}

export function listOrders(): Order[] {
  return orders;
}

export function getOrder(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function ordersSummary(list: Order[] = orders): OrdersSummary {
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
    shippedTodayCount: list.filter((o) => o.stage === "shipped" && o.placedDay === "today").length,
    refundsCount: list.filter(
      (o) => o.paymentStatus === "partially-refunded" || o.paymentStatus === "refund-requested" || !!o.refundRequest,
    ).length,
  };
}

export function heldOrders(list: Order[] = orders): Order[] {
  return list.filter((o) => isOpenOrder(o) && o.hold);
}

/* ---------------- dashboard ---------------- */

const TONE_RANK: Record<string, number> = { problem: 0, tape: 1, ink: 2, slate: 3, paid: 4, muted: 5 };

export function dashboardData(list: Order[] = orders, skus: Sku[] = listSkus()): DashboardData {
  const summary = ordersSummary(list);
  const inv = inventorySummary(skus);

  const exceptions: DashboardException[] = heldOrders(list).map((o) => ({
    id: `EX-${o.id}`,
    kind: "order" as const,
    tone: o.hold!.tone,
    orderId: o.id,
    sku: o.hold!.sku ?? o.lines[0]?.sku ?? null,
    stampLabel: o.hold!.title,
    title: `${o.customerName} · ${o.lines.reduce((s, l) => s + l.qty, 0)} item${o.lines.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"} · $${(o.totalCents / 100).toFixed(2)}`,
    reason: o.hold!.reason,
    codesLabel: o.lines.map((l) => `${l.sku} ×${l.qty}`).join(" · "),
    actorLabel: o.hold!.countedBy ? `${o.hold!.countedBy} · ${o.hold!.flaggedAtLabel ?? o.hold!.countedAtLabel}` : null,
  }));

  /* The sold-out variant exception (SM-TER), drawn as its own row on C-01. */
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
      codesLabel: `last sold Oct 4 · ${getProduct(s.productSlug)?.sold30d ?? 0} sold in 30 days · ${s.incoming?.qty ?? 0} arriving Thursday`,
      actorLabel: null,
    });
  }
  /* Exceptions lead, sorted problem-first, then tape-ink (§5.3). */
  exceptions.sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9));

  const queue = list
    .filter((o) => isOpenOrder(o) && !o.hold)
    .sort((a, b) => (a.shipByMinutes ?? 9999) - (b.shipByMinutes ?? 9999));

  const days: RevenueDay[] = shop.last7Days.revenueByDay;
  const belowSafety = liveSkus(skus).filter(
    (s) => s.safetyPoint != null && availableOf(s) <= s.safetyPoint,
  ).length;

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
      rangeLabel: shop.last7Days.rangeLabel,
      revenueCents: days.reduce((s, d) => s + d.revenueCents, 0),
      revenueChangePct: shop.last7Days.revenueChangePct,
      orders: days.reduce((s, d) => s + d.orders, 0),
      ordersVsLastWeek: shop.last7Days.ordersVsLastWeek,
      heldOrders: summary.heldCount,
      lowStockSkus: inv.belowReorder,
      belowSafety,
      atZero: inv.atZero,
      revenueByDay: days,
      peakCents: Math.max(...days.map((d) => d.revenueCents)),
    },
    /* The watch panel's drawn set, in drawn order. */
    inventoryWatch: ["SM-TER", "LA-CHR", "CT-NAT", "OSB-LG"]
      .map((code) => skus.find((s) => s.sku === code))
      .filter((s): s is Sku => !!s),
  };
}

/* ---------------- customers ---------------- */

export function listCustomers(): Customer[] {
  return customers;
}

export function getCustomer(slug: string): Customer | undefined {
  return customers.find((c) => c.slug === slug);
}

export function customersTotals(): CustomersTotals {
  return (customersJson as unknown as { totals: CustomersTotals }).totals;
}

/** Average order value in cents, rounded — $614 / 6 = $102.33 for Avery. */
export function averageOrderCents(c: Customer): number {
  return c.orderCount === 0 ? 0 : Math.round(c.spentCents / c.orderCount);
}

/* ---------------- discounts ---------------- */

export function listDiscounts(): Discount[] {
  return discounts;
}

export function getDiscount(code: string): Discount | undefined {
  return discounts.find((d) => d.code === code);
}

export function discountsTotals(): DiscountTotals {
  return (discountsJson as unknown as { totals: DiscountTotals }).totals;
}

/* ---------------- audit & settings ---------------- */

export function listAudit(): AuditList {
  const data = auditJson as unknown as { totalCount: number; defaultShown: number; entries: AuditList["entries"] };
  return { entries: data.entries, totalCount: data.totalCount, shownCount: data.defaultShown };
}

export function getSettings(): ShopSettings {
  return settingsJson as unknown as ShopSettings;
}
