/* Fixture read API (legacy) — re-export shim.
 *
 * The pure derivations that used to live here moved to src/lib/derive.ts
 * (fixture-free; ruling 2). This module re-exports them bound to the
 * fixture store so legacy consumers keep working unchanged, and keeps
 * the fixture data exports. New admin-console code must import
 * derivations from "@/lib/derive" and data from "@/lib/shop/admin" —
 * never from here (this module imports src/data/*.json at module level).
 */
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
  AuditList, Customer, CustomersTotals, DashboardData, Discount,
  DiscountTotals, Order, PermissionRow, Product, PurchaseOrder, Shop,
  ShopSettings, Sku, StockMovement, TeamInvite, TeamMember,
} from "./types";
import {
  averageOrderCents as averageOrderCentsPure,
  dashboardFromData,
  inventorySummary as inventorySummaryPure,
  listSkus as listSkusPure,
  restockProductCount as restockProductCountPure,
} from "./derive";

export {
  availableOf,
  deriveDiscountStatus,
  deriveRefundStatus,
  heldOrders,
  isBelowReorder,
  isOpenOrder,
  liveSkus,
  ordersSummary,
} from "./derive";
export type { DashboardContext } from "./derive";

export const shop = shopJson as unknown as Shop;
export const products = productsJson.products as unknown as Product[];
export const orders = ordersJson.orders as unknown as Order[];
export const customers = customersJson.customers as unknown as Customer[];
export const discounts = discountsJson.discounts as unknown as Discount[];
export const purchaseOrders = purchaseOrdersJson.purchaseOrders as unknown as PurchaseOrder[];

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

/* ---------------- catalogue & inventory (fixture-bound) ---------------- */

export function listProducts(): Product[] {
  return products;
}

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function listSkus(list: Product[] = products): Sku[] {
  return listSkusPure(list);
}

/** Legacy argument order (code, list?) — derive.getSku is (list, code). */
export function getSku(code: string, list: Product[] = products): Sku | undefined {
  return listSkusPure(list).find((s) => s.sku === code);
}

export function inventorySummary(skus: Sku[] = listSkus()) {
  return inventorySummaryPure(
    skus,
    purchaseOrders.reduce(
      (sum, po) => sum + po.lines.reduce((s, l) => s + l.qty, 0),
      0,
    ),
  );
}

export function restockProductCount(list: Product[] = products): number {
  return restockProductCountPure(list);
}

export function listPurchaseOrders(): PurchaseOrder[] {
  return purchaseOrders;
}

export function todaysMovements(): StockMovement[] {
  return movementsJson.movements as unknown as StockMovement[];
}

/* ---------------- orders (fixture-bound) ---------------- */

export function listOrders(): Order[] {
  return orders;
}

export function getOrder(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

/* ---------------- dashboard (fixture-bound) ---------------- */

export function dashboardData(
  list: Order[] = orders,
  skus: Sku[] = listSkus(),
): DashboardData {
  return dashboardFromData({
    orders: list,
    skus,
    days: shop.last7Days.revenueByDay,
    shop: {
      days: shop.last7Days.revenueByDay,
      todayLabel: shop.todayLabel,
      dayHeroLabel: shop.dayHeroLabel,
      cutoffLabel: shop.cutoffLabel,
      rangeLabel: shop.last7Days.rangeLabel,
      arrivingQty: purchaseOrders.reduce(
        (sum, po) => sum + po.lines.reduce((s, l) => s + l.qty, 0),
        0,
      ),
      watchSkus: ["SM-TER", "LA-CHR", "CT-NAT", "OSB-LG"],
      sold30dBySlug: Object.fromEntries(products.map((p) => [p.slug, p.sold30d])),
      // The fixture series is a single drawn week; the drawn change
      // figures are reproduced by construction so legacy consumers see
      // identical numbers: prev = current adjusted by the drawn pct.
      prevRevenueCents: Math.round(
        shop.last7Days.revenueByDay.reduce((s, d) => s + d.revenueCents, 0) /
          (1 + shop.last7Days.revenueChangePct / 100),
      ),
      prevOrders:
        shop.last7Days.revenueByDay.reduce((s, d) => s + d.orders, 0) -
        shop.last7Days.ordersVsLastWeek,
    },
  });
}

/* ---------------- customers & discounts (fixture-bound) ---------------- */

export function listCustomers(): Customer[] {
  return customers;
}

export function getCustomer(slug: string): Customer | undefined {
  return customers.find((c) => c.slug === slug);
}

export function customersTotals(): CustomersTotals {
  return (customersJson as unknown as { totals: CustomersTotals }).totals;
}

export function averageOrderCents(c: Customer): number {
  return averageOrderCentsPure(c);
}

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
