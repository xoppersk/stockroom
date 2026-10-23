/* Mapper tests: DB-shaped rows (migration 00001–00012 shapes, money as
 * PostgREST strings — one row deliberately numeric) run through the
 * REAL mappers in admin.ts and the REAL derivations in derive.ts.
 * All expectations are hand-computed from the dataset below.
 *
 * Dataset sketch (NOW = Tue Oct 6 2026, 10:48 AM ET):
 *   Variants: MUG-TER onHand 5 thr 18 · MUG-MOS onHand 1 thr 12 ·
 *             APR-CHR onHand 10 thr 5 · OPN-OLD (archived) onHand 0
 *   Orders:   ORD-2001 paid/paid today (MUG-TER×2, APR-CHR×1, $138.00)
 *             ORD-2002 pending/pending today, online (MUG-MOS×1, $28)
 *             ORD-2003 paid/FAILED yesterday (APR-CHR×1, $64)
 *             ORD-2004 fulfilled/paid 10d ago (MUG-TER×3, $84)
 *             ORD-2005 refunded/refunded 5d ago (MUG-MOS×1, $28 back)
 *             ORD-2006 paid/partial 2d ago (APR-CHR×1, $64, $10 back)
 *             ORD-2007 cancelled/void 3d ago (MUG-MOS×1, $28)
 *             ORD-2008 pending/pending today, online (APR-CHR×1, $64)
 *   Committed (pending/paid): MUG-TER 2, MUG-MOS 1, APR-CHR 4
 *   Available: MUG-TER 3, MUG-MOS 0, APR-CHR 6, OPN-OLD 0 (archived)
 *   sold30d (paid/fulfilled): MUG-TER 5, MUG-MOS 0, APR-CHR 3
 */
import { describe, expect, it } from "vitest";
import {
  availableOf,
  averageOrderCents,
  customersTotalsFrom,
  dashboardFromData,
  deriveRefundStatus,
  discountsTotalsFrom,
  heldOrders,
  inventorySummary,
  listSkus,
  ordersSummary,
  restockProductCount,
} from "../derive";
import {
  computeCommitments,
  deriveStage,
  mapAuditRow,
  mapCustomerRow,
  mapDiscountRow,
  mapMovementRow,
  mapOrderRow,
  mapProductRow,
  mapPurchaseOrderRow,
  mapTeamMember,
  type InventoryInfo,
  type OrderMapContext,
} from "./admin";
import type {
  ShopAuditLog,
  ShopCustomer,
  ShopDiscount,
  ShopDiscountRedemption,
  ShopInventoryAdjustment,
  ShopOrder,
  ShopOrderItem,
  ShopVariant,
} from "./types";

const NOW = new Date("2026-10-06T14:48:00.000Z");

/* ---------------- raw DB-shaped rows ---------------- */

const VARIANT_TER: ShopVariant = {
  id: "v-ter", product_id: "p-mug", title: "Terracotta", sku: "MUG-TER",
  option_values: { Color: "Terracotta" }, price: "28.00", compare_at_price: null,
  position: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  shelf: "C-02", cost_price: "11.50",
};
const VARIANT_MOS: ShopVariant = {
  id: "v-mos", product_id: "p-mug", title: "Moss", sku: "MUG-MOS",
  option_values: { Color: "Moss" }, price: "28.00", compare_at_price: null,
  position: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  shelf: "C-02", cost_price: "11.50",
};
const VARIANT_CHR: ShopVariant = {
  id: "v-chr", product_id: "p-apron", title: "Charcoal", sku: "APR-CHR",
  option_values: { Color: "Charcoal" }, price: "64.00", compare_at_price: "80.00",
  position: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  shelf: "A-03", cost_price: null,
};
const VARIANT_OLD: ShopVariant = {
  id: "v-old", product_id: "p-old", title: "Standard", sku: "OPN-OLD",
  option_values: {}, price: "19.00", compare_at_price: null,
  position: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  shelf: null, cost_price: null,
};

function orderRow(p: Partial<ShopOrder> & { id: string; order_number: string }): ShopOrder {
  return {
    customer_id: null, status: "paid", payment_status: "paid",
    subtotal: "0", discount_total: "0", tax_total: "0", shipping_total: "0",
    total: "0", refunded_total: "0", currency: "USD", discount_code: null,
    shipping_address: null, tracking_number: null, source: "manual",
    external_id: null, guest_token: null, stripe_checkout_session_id: null,
    created_by: null, created_at: "2026-10-06T13:00:00Z",
    updated_at: "2026-10-06T13:00:00Z", fulfillment_stage: null,
    ...p,
  };
}
function itemRow(p: Partial<ShopOrderItem> & { order_id: string }): ShopOrderItem {
  return {
    id: `i-${p.order_id}-${p.sku ?? "x"}`, variant_id: null,
    product_title: "", variant_title: "", sku: "", quantity: 1,
    unit_price: "0", line_total: "0", ...p,
  };
}

const ORDERS: ShopOrder[] = [
  orderRow({ id: "o1", order_number: "ORD-2001", customer_id: "c-avery", status: "paid", payment_status: "paid", subtotal: "120.00", shipping_total: "11.40", tax_total: "6.60", total: "138.00", source: "storefront", created_at: "2026-10-06T13:41:00Z" }),
  orderRow({ id: "o2", order_number: "ORD-2002", status: "pending", payment_status: "pending", subtotal: "28.00", total: "28.00", source: "storefront", created_at: "2026-10-06T14:00:00Z" }),
  orderRow({ id: "o3", order_number: "ORD-2003", status: "paid", payment_status: "failed", subtotal: "64.00", total: "64.00", source: "storefront", created_at: "2026-10-05T12:15:00Z" }),
  orderRow({ id: "o4", order_number: "ORD-2004", customer_id: "c-avery", status: "fulfilled", payment_status: "paid", subtotal: "84.00", total: "84.00", created_at: "2026-09-26T12:00:00Z" }),
  orderRow({ id: "o5", order_number: "ORD-2005", customer_id: "c-jules", status: "refunded", payment_status: "refunded", subtotal: "28.00", total: "28.00", refunded_total: "28.00", created_at: "2026-10-01T12:00:00Z" }),
  orderRow({ id: "o6", order_number: "ORD-2006", customer_id: "c-jules", status: "paid", payment_status: "partially_refunded", subtotal: "64.00", total: 64 as unknown as string, refunded_total: "10.00", created_at: "2026-10-04T12:00:00Z" }),
  orderRow({ id: "o7", order_number: "ORD-2007", status: "cancelled", payment_status: "void", subtotal: "28.00", total: "28.00", created_at: "2026-10-03T12:00:00Z" }),
  orderRow({ id: "o8", order_number: "ORD-2008", status: "pending", payment_status: "pending", subtotal: "64.00", total: "64.00", source: "storefront", created_at: "2026-10-06T14:30:00Z" }),
];
const ITEMS: ShopOrderItem[] = [
  itemRow({ order_id: "o1", variant_id: "v-ter", product_title: "Stoneware mug", variant_title: "Terracotta", sku: "MUG-TER", quantity: 2, unit_price: "28.00", line_total: "56.00" }),
  itemRow({ order_id: "o1", variant_id: "v-chr", product_title: "Linen apron", variant_title: "Charcoal", sku: "APR-CHR", quantity: 1, unit_price: "64.00", line_total: "64.00" }),
  itemRow({ order_id: "o2", variant_id: "v-mos", product_title: "Stoneware mug", variant_title: "Moss", sku: "MUG-MOS", quantity: 1, unit_price: "28.00", line_total: "28.00" }),
  itemRow({ order_id: "o3", variant_id: "v-chr", product_title: "Linen apron", variant_title: "Charcoal", sku: "APR-CHR", quantity: 1, unit_price: "64.00", line_total: "64.00" }),
  itemRow({ order_id: "o4", variant_id: "v-ter", product_title: "Stoneware mug", variant_title: "Terracotta", sku: "MUG-TER", quantity: 3, unit_price: "28.00", line_total: "84.00" }),
  itemRow({ order_id: "o5", variant_id: "v-mos", product_title: "Stoneware mug", variant_title: "Moss", sku: "MUG-MOS", quantity: 1, unit_price: "28.00", line_total: "28.00" }),
  itemRow({ order_id: "o6", variant_id: "v-chr", product_title: "Linen apron", variant_title: "Charcoal", sku: "APR-CHR", quantity: 1, unit_price: "64.00", line_total: "64.00" }),
  itemRow({ order_id: "o7", variant_id: "v-mos", product_title: "Stoneware mug", variant_title: "Moss", sku: "MUG-MOS", quantity: 1, unit_price: "28.00", line_total: "28.00" }),
  itemRow({ order_id: "o8", variant_id: "v-chr", product_title: "Linen apron", variant_title: "Charcoal", sku: "APR-CHR", quantity: 1, unit_price: "64.00", line_total: "64.00" }),
];

const LEVELS = new Map<string, { onHand: number; threshold: number }>([
  ["v-ter", { onHand: 5, threshold: 18 }],
  ["v-mos", { onHand: 1, threshold: 12 }],
  ["v-chr", { onHand: 10, threshold: 5 }],
  ["v-old", { onHand: 0, threshold: 5 }],
]);

/* Decrement oracle for this dataset: the seed + both RPC paths write a
 * 'sale' adjustment (reference = order_number) for every paid order, so
 * the three paid orders are already out of quantity_on_hand; the two
 * storefront pendings are not. */
const DECREMENTED = new Set(["ORD-2001", "ORD-2003", "ORD-2006"]);
const { committed, reserved, sold30d } = computeCommitments(ORDERS, ITEMS, NOW, DECREMENTED);
const inventoryByVariant = new Map<string, InventoryInfo>(
  [...LEVELS].map(([id, l]) => [
    id,
    { ...l, committed: committed.get(id) ?? 0, reserved: reserved.get(id) ?? 0 },
  ]),
);

const orderCtx: OrderMapContext = {
  now: NOW,
  customerNameById: new Map([
    ["c-avery", "Avery Lewis"],
    ["c-jules", "Jules Hart"],
  ]),
  itemsByOrder: new Map(
    ORDERS.map((o) => [o.id, ITEMS.filter((i) => i.order_id === o.id)]),
  ),
  eventsByOrder: new Map([
    [
      "o3",
      [
        {
          id: "e1", order_id: "o3", event_type: "payment_failed",
          message: "Payment failed for ORD-2003.", metadata: null,
          created_by: null, created_at: "2026-10-05T12:15:00Z",
        },
      ],
    ],
  ]),
  shelfByVariant: new Map([
    ["v-ter", "C-02"],
    ["v-mos", "C-02"],
    ["v-chr", "A-03"],
    ["v-old", null],
  ]),
  inventoryByVariant,
};
const mappedOrders = ORDERS.map((o) => mapOrderRow(o, orderCtx));
const byNumber = (n: string) => mappedOrders.find((o) => o.id === n)!;

const productCtx = {
  now: NOW,
  categoryNameById: new Map([["cat-table", "Tableware"]]),
  inventoryByVariant,
  sold30dByVariant: sold30d,
  incomingByVariant: new Map([
    ["v-ter", { qty: 48, dayLabel: "Oct 8", poId: "PO-0214" }],
  ]),
};
const mappedProducts = [
  mapProductRow(
    { id: "p-mug", title: "Stoneware mug", slug: "stoneware-mug", description: "", category_id: "cat-table", tags: [], status: "published" },
    [VARIANT_TER, VARIANT_MOS],
    productCtx,
  ),
  mapProductRow(
    { id: "p-apron", title: "Linen apron", slug: "linen-apron", description: "Heavy linen.", category_id: "cat-table", tags: [], status: "published" },
    [VARIANT_CHR],
    productCtx,
  ),
  mapProductRow(
    { id: "p-old", title: "Discontinued opener", slug: "old-opener", description: "", category_id: null, tags: [], status: "archived" },
    [VARIANT_OLD],
    productCtx,
  ),
];
const mappedSkus = listSkus(mappedProducts);

/* ---------------- commitments & inventory ---------------- */

describe("commitments + inventory mapping (DB-shaped)", () => {
  it("committed = Σ items over pending/paid only, per variant", () => {
    expect(committed.get("v-ter")).toBe(2);
    expect(committed.get("v-mos")).toBe(1);
    expect(committed.get("v-chr")).toBe(4);
    expect(committed.get("v-old")).toBeUndefined();
  });

  it("sold30d = Σ items over paid/fulfilled in the last 30 days", () => {
    expect(sold30d.get("v-ter")).toBe(5);
    expect(sold30d.get("v-mos") ?? 0).toBe(0); // no qualifying sales → no entry
    expect(sold30d.get("v-chr")).toBe(3);
  });

  it("inventory summary over mapped SKUs matches hand-computed tallies", () => {
    const s = inventorySummary(mappedSkus, 140);
    expect(s.totalSkus).toBe(4);
    expect(s.belowReorder).toBe(2); // MUG-TER 5<18, MUG-MOS 0<12 (archived excluded)
    expect(s.atZero).toBe(1); // MUG-MOS only; OPN-OLD is archived
    expect(s.onHand).toBe(21); // physical shelf: onHand 16 + reserved add-back 5
    expect(s.committed).toBe(7);
    expect(s.arrivingThisWeek).toBe(140); // parameter, not a fixture import
    expect(restockProductCount(mappedProducts)).toBe(1); // the mug only
  });

  it("reserved add-back: paid orders are not subtracted twice; undecremented pendings claim on-hand", () => {
    /* o1 (paid, decremented): v-ter ×2 + v-chr ×1 are back on the shelf.
     * o3 + o6 (paid, decremented): v-chr ×1 each. o8 (pending storefront,
     * NOT decremented) and o2 (pending): no add-back — their units still
     * sit inside quantity_on_hand and committed claims them there. */
    expect(reserved.get("v-ter")).toBe(2);
    expect(reserved.get("v-chr")).toBe(3);
    expect(reserved.get("v-mos") ?? 0).toBe(0);
    const chr = mappedSkus.find((s) => s.sku === "APR-CHR")!;
    expect(chr.onShelf).toBe(13); // 10 on hand + 3 reserved
    expect(availableOf(chr)).toBe(9); // 13 − 4 committed
    const ter = mappedSkus.find((s) => s.sku === "MUG-TER")!;
    expect(ter.onShelf).toBe(7);
    expect(availableOf(ter)).toBe(5);
  });

  it("available = onHand − committed for every SKU, never negative", () => {
    for (const sku of mappedSkus) {
      expect(availableOf(sku)).toBe(sku.onShelf - sku.committed);
      expect(availableOf(sku)).toBeGreaterThanOrEqual(0);
    }
    expect(availableOf(mappedSkus.find((s) => s.sku === "MUG-MOS")!)).toBe(0);
  });

  it("variant mapping carries 00012 shelf/cost and PO incoming", () => {
    const ter = mappedProducts[0]!.variants[0]!;
    expect(ter.shelf).toBe("C-02");
    expect(ter.costCents).toBe(1150);
    expect(ter.incoming).toMatchObject({ qty: 48, poId: "PO-0214" });
    expect(ter.compareAtCents).toBeNull();
    expect(mappedProducts[1]!.variants[0]!.compareAtCents).toBe(8000);
    expect(mappedProducts[0]!.sold30d).toBe(5);
    expect(mappedProducts[0]!.status).toBe("active"); // published → active
    expect(mappedProducts[2]!.status).toBe("archived");
  });
});

/* ---------------- orders mapping ---------------- */

describe("order mapping (DB-shaped)", () => {
  it("id is the order_number, uuid is the DB id", () => {
    expect(byNumber("ORD-2001").uuid).toBe("o1");
    expect(byNumber("ORD-2001").customerName).toBe("Avery Lewis");
    expect(byNumber("ORD-2001").placedDay).toBe("today");
    expect(byNumber("ORD-2003").placedDay).toBe("yesterday");
    expect(byNumber("ORD-2004").placedDay).toBe("earlier");
  });

  it("every mapped order's lines sum to its subtotal and totals are positive", () => {
    for (const o of mappedOrders) {
      expect(o.lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0)).toBe(o.subtotalCents);
      expect(o.subtotalCents + o.shippingCents + o.taxCents).toBe(o.totalCents);
      expect(o.totalCents).toBeGreaterThan(0);
    }
    /* ORD-2006's total arrived as a JSON number, not a string. */
    expect(byNumber("ORD-2006").totalCents).toBe(6400);
  });

  it("stage derivation: fulfillment_stage wins, else status (ruling 4)", () => {
    expect(deriveStage(orderRow({ id: "x", order_number: "ORD-X", status: "paid", fulfillment_stage: "packing" }))).toEqual({ stage: "packing", stageLabel: "Packing" });
    expect(deriveStage(orderRow({ id: "x", order_number: "ORD-X", status: "fulfilled" })).stage).toBe("shipped");
    expect(deriveStage(orderRow({ id: "x", order_number: "ORD-X", status: "cancelled" }))).toEqual({ stage: "delivered", stageLabel: "Cancelled" });
    expect(byNumber("ORD-2001").stage).toBe("to-pick");
    expect(byNumber("ORD-2007").stageLabel).toBe("Cancelled");
  });

  it("holds come from real signals only (ruling 5)", () => {
    /* failed payment → payment hold, problem tone */
    expect(byNumber("ORD-2003").hold).toMatchObject({ kind: "payment", tone: "problem", title: "Payment failed" });
    expect(byNumber("ORD-2003").stage).toBe("held");
    /* available 0 < ordered 1 → stock hold with the real system count */
    expect(byNumber("ORD-2002").hold).toMatchObject({ kind: "stock", sku: "MUG-MOS", systemCount: 1 });
    /* pending payment on an online order → payment hold */
    expect(byNumber("ORD-2008").hold).toMatchObject({ kind: "payment", title: "Payment pending" });
    /* healthy paid order → no hold */
    expect(byNumber("ORD-2001").hold).toBeNull();
    /* a counter order with pending payment gets NO invented hold */
    const counter = mapOrderRow(
      orderRow({ id: "o9", order_number: "ORD-2009", status: "pending", payment_status: "pending", source: "manual", subtotal: "64.00", total: "64.00" }),
      { ...orderCtx, itemsByOrder: new Map([["o9", [ITEMS[3]!]]]) },
    );
    expect(counter.hold).toBeNull();
  });

  it("refund status derives from money: refunded ≥ total → refunded", () => {
    expect(deriveRefundStatus(2800, 2800)).toBe("refunded");
    expect(deriveRefundStatus(1000, 6400)).toBe("partially-refunded");
    expect(deriveRefundStatus(0, 6400)).toBeNull();
    expect(byNumber("ORD-2005").paymentStatus).toBe("refunded");
    expect(byNumber("ORD-2005").refundedCents).toBe(2800);
    expect(byNumber("ORD-2006").paymentStatus).toBe("partially-refunded");
    expect(byNumber("ORD-2007").paymentStatus).toBe("pending"); // void
    expect(byNumber("ORD-2003").history).toHaveLength(1);
    expect(byNumber("ORD-2001").lines[0]).toMatchObject({ sku: "MUG-TER", shelf: "C-02", qty: 2 });
  });

  it("orders summary: open = held + fulfill, hand-computed", () => {
    const s = ordersSummary(mappedOrders);
    expect(s.openCount).toBe(5); // + ORD-2006: paid, no hold, to-pick
    expect(s.heldCount).toBe(3);
    expect(s.toFulfillCount).toBe(2);
    expect(s.openCount).toBe(s.heldCount + s.toFulfillCount);
    expect(s.pickCount).toBe(2);
    expect(s.packCount).toBe(0);
    expect(s.readyCount).toBe(0);
    expect(s.openTotalCents).toBe(13800 + 2800 + 6400 + 6400 + 6400);
    expect(s.refundsCount).toBe(1); // ORD-2006 partially refunded
    expect(heldOrders(mappedOrders).map((o) => o.id)).toEqual([
      "ORD-2002",
      "ORD-2003",
      "ORD-2008",
    ]);
  });
});

/* ---------------- dashboard derivation ---------------- */

describe("dashboardFromData over mapped data", () => {
  const days = [
    { dateISO: "2026-09-30", dateLabel: "Sep 30", dayLabel: "30", orders: 2, revenueCents: 10000 },
    { dateISO: "2026-10-01", dateLabel: "Oct 1", dayLabel: "1", orders: 3, revenueCents: 20000 },
    { dateISO: "2026-10-02", dateLabel: "Oct 2", dayLabel: "2", orders: 1, revenueCents: 38200 },
    { dateISO: "2026-10-03", dateLabel: "Oct 3", dayLabel: "3", orders: 4, revenueCents: 15000 },
    { dateISO: "2026-10-04", dateLabel: "Oct 4", dayLabel: "4", orders: 2, revenueCents: 12000 },
    { dateISO: "2026-10-05", dateLabel: "Oct 5", dayLabel: "5", orders: 3, revenueCents: 18000 },
    { dateISO: "2026-10-06", dateLabel: "Oct 6", dayLabel: "Today", orders: 2, revenueCents: 9000 },
  ];
  const dash = dashboardFromData({
    orders: mappedOrders,
    skus: mappedSkus,
    days,
    shop: {
      days,
      todayLabel: "Tuesday, Oct 6",
      dayHeroLabel: "Tuesday, October 6",
      cutoffLabel: "2:00 PM",
      rangeLabel: "Sep 30 – Oct 6",
      prevRevenueCents: 110000,
      prevOrders: 15,
      arrivingQty: 140,
      watchSkus: ["MUG-MOS", "APR-CHR"],
      sold30dBySlug: { "stoneware-mug": 5 },
    },
  });

  it("ledger7 aggregates the supplied days; peak is the max day", () => {
    expect(dash.ledger7.orders).toBe(17);
    expect(dash.ledger7.revenueCents).toBe(122200);
    expect(dash.ledger7.peakCents).toBe(38200);
    expect(dash.ledger7.revenueByDay).toHaveLength(7);
    expect(dash.ledger7.ordersVsLastWeek).toBe(2);
    expect(dash.ledger7.heldOrders).toBe(3);
    expect(dash.ledger7.lowStockSkus).toBe(2);
    expect(dash.ledger7.atZero).toBe(1);
  });

  it("pipeline mirrors the orders summary", () => {
    expect(dash.pipeline).toEqual({ shipped: 0, ready: 0, packing: 0, toPick: 2 });
    expect(dash.toGoToday).toBe(2);
    expect(dash.fulfillmentTotal).toBe(2);
  });

  it("exceptions sort problem-first, then tape", () => {
    const tones = dash.exceptions.map((e) => e.tone);
    const rank = (t: string) => (t === "problem" ? 0 : t === "tape" ? 1 : 2);
    expect(tones).toEqual([...tones].sort((a, b) => rank(a) - rank(b)));
    expect(dash.exceptions[0]!.tone).toBe("problem");
    /* held orders + the one sold-out live SKU */
    expect(dash.exceptions).toHaveLength(4);
    expect(dash.exceptions.some((e) => e.kind === "stock" && e.sku === "MUG-MOS")).toBe(true);
  });

  it("inventory watch preserves the caller's order", () => {
    expect(dash.inventoryWatch.map((s) => s.sku)).toEqual(["MUG-MOS", "APR-CHR"]);
  });
});

/* ---------------- customers / discounts / audit / team ---------------- */

const CUSTOMER_AVERY: ShopCustomer = {
  id: "c-avery", first_name: "Avery", last_name: "Lewis",
  email: "avery@example.com", phone: null, tags: ["Returning"],
  notes: "Prefers paper packaging.\n\n[2026-10-02] Asked when the Terracotta mug is back.",
  created_at: "2026-03-14T12:00:00Z", updated_at: "2026-03-14T12:00:00Z",
};
const CUSTOMER_JULES: ShopCustomer = {
  id: "c-jules", first_name: "Jules", last_name: "Hart",
  email: "jules@example.com", phone: null, tags: [],
  notes: "", created_at: "2026-06-01T12:00:00Z", updated_at: "2026-06-01T12:00:00Z",
};

describe("customer mapping (DB-shaped)", () => {
  const averyOrders = mappedOrders.filter((o) => o.customerSlug === "c-avery");
  const avery = mapCustomerRow(CUSTOMER_AVERY, {
    now: NOW,
    addressByCustomer: new Map([
      ["c-avery", { id: "a1", customer_id: "c-avery", label: "shipping", line1: "2214 Fitzwater Street", line2: null, city: "Philadelphia", region: "PA", postal_code: "19146", country: "US", is_default: true }],
    ]),
    orders: averyOrders,
    wholesaleDiscount: null,
  });
  const julesOrders = mappedOrders.filter((o) => o.customerSlug === "c-jules");
  const jules = mapCustomerRow(CUSTOMER_JULES, {
    now: NOW, addressByCustomer: new Map(), orders: julesOrders, wholesaleDiscount: null,
  });

  it("aggregates derive from the customer's real orders", () => {
    expect(avery.slug).toBe("c-avery"); // slug = uuid (ruling 9)
    expect(avery.orderCount).toBe(2);
    expect(avery.spentCents).toBe(13800 + 8400);
    expect(averageOrderCents(avery)).toBe(11100); // rounded average
    expect(avery.orderHistory.reduce((s, o) => s + o.totalCents, 0)).toBe(avery.spentCents);
    expect(avery.lastOrder?.orderId).toBe("ORD-2004");
    expect(avery.location).toBe("Philadelphia, PA");
    expect(avery.address).toContain("2214 Fitzwater Street");
  });

  it("spent excludes refunded money; returns count refunded orders", () => {
    expect(jules.orderCount).toBe(2);
    expect(jules.spentCents).toBe(0 + (6400 - 1000));
    expect(jules.returns).toBe(2);
    expect(averageOrderCents(jules)).toBe(2700);
  });

  it("notes text parses into dated paragraphs; [date] prefix wins", () => {
    expect(avery.notes).toHaveLength(2);
    expect(avery.notes[1]).toMatchObject({ dateLabel: "Oct 2" });
    expect(avery.notes[1]!.text).toContain("Terracotta mug");
    expect(jules.notes).toEqual([]);
  });

  it("wholesale appears only with a tag + a matching discount code (ruling 9)", () => {
    const plain = mapCustomerRow(
      { ...CUSTOMER_AVERY, id: "c-ws", tags: ["wholesale"] },
      { now: NOW, addressByCustomer: new Map(), orders: [], wholesaleDiscount: null },
    );
    expect(plain.type).toBe("wholesale");
    expect(plain.wholesale).toBeUndefined();
    const linked = mapCustomerRow(
      { ...CUSTOMER_AVERY, id: "c-ws", tags: ["wholesale", "KETTLE25"] },
      {
        now: NOW, addressByCustomer: new Map(), orders: [],
        wholesaleDiscount: mapDiscountRow(
          { id: "d-k", code: "KETTLE25", kind: "percentage", value: "25", usage_limit: null, per_customer_limit: null, min_order_value: "0", starts_at: "2026-01-01T00:00:00Z", ends_at: null, status: "active", created_by: null, created_at: "2026-01-01T00:00:00Z" },
          [], NOW,
        ),
      },
    );
    expect(linked.wholesale).toMatchObject({ discountPct: 25, code: "KETTLE25" });
  });

  it("customers totals derive from the list (ruling: no fixture totals)", () => {
    const third = mapCustomerRow(
      { ...CUSTOMER_JULES, id: "c-one", tags: ["wholesale"] },
      { now: NOW, addressByCustomer: new Map(), orders: [byNumber("ORD-2001")], wholesaleDiscount: null },
    );
    const totals = customersTotalsFrom([avery, jules, third], 4);
    expect(totals).toEqual({
      total: 3, returning: 2, waitingOnRestock: 0, wholesale: 1, openOrders: 4,
    });
  });
});

function discountRow(p: Partial<ShopDiscount> & { code: string }): ShopDiscount {
  return {
    id: `d-${p.code}`, kind: "percentage", value: "15", usage_limit: null,
    per_customer_limit: null, min_order_value: "0",
    starts_at: "2026-08-07T00:00:00Z", ends_at: null, status: "active",
    created_by: null, created_at: "2026-08-07T00:00:00Z", ...p,
  };
}
function redemption(p: Partial<ShopDiscountRedemption>): ShopDiscountRedemption {
  return {
    id: "r-x", discount_id: "d-WELCOME15", order_id: "o1", customer_id: null,
    amount: "5.00", created_at: "2026-10-01T00:00:00Z", ...p,
  };
}

describe("discount mapping (DB-shaped)", () => {
  const welcome = mapDiscountRow(
    discountRow({ code: "WELCOME15" }),
    [
      redemption({ amount: "5.00", created_at: "2026-10-01T00:00:00Z" }),
      redemption({ amount: "7.00", created_at: "2026-09-20T00:00:00Z" }),
      redemption({ amount: "9.00", created_at: "2026-06-01T00:00:00Z" }), // > 30d ago
    ],
    NOW,
  );

  it("exposes additive raw extras for the builder (W-PEOPLE integration)", () => {
    expect(welcome.id).toBe("d-WELCOME15");
    expect(welcome.uuid).toBe("d-WELCOME15");
    expect(welcome.startsAt).toBe("2026-08-07T00:00:00Z");
    expect(welcome.endsAt).toBeNull();
    expect(welcome.valueCents).toBe(1500); // 15.00 → cents
    expect(welcome.dbKind).toBe("percentage");
    expect(welcome.rawKind).toBe("percentage");
  });

  it("uses = redemption count; givenCents30d sums only the last 30 days", () => {
    expect(welcome.kind).toBe("percent");
    expect(welcome.pct).toBe(15);
    expect(welcome.uses).toBe(3);
    expect(welcome.givenCents30d).toBe(1200);
    expect(welcome.status).toBe("running");
  });

  it("status derivation: paused / expired / scheduled / limit (ruling 10)", () => {
    const paused = mapDiscountRow(discountRow({ code: "P5", status: "paused" }), [], NOW);
    expect(paused.status).toBe("ended");
    expect(paused.endedReasonLabel).toBe("Paused");
    const expired = mapDiscountRow(
      discountRow({ code: "OLD20", ends_at: "2026-09-01T00:00:00Z" }), [], NOW,
    );
    expect(expired.status).toBe("ended");
    const scheduled = mapDiscountRow(
      discountRow({ code: "FUT10", starts_at: "2026-10-15T00:00:00Z" }), [], NOW,
    );
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.startsInLabel).toBe("Starts in 9 days");
    const limited = mapDiscountRow(
      discountRow({ code: "LIM5", usage_limit: 2 }),
      [redemption({}), redemption({})], NOW,
    );
    expect(limited.status).toBe("ended");
    expect(limited.endedReasonLabel).toBe("Ended at its 2-use limit");
  });

  it("fixed-amount kind maps honestly (no free-shipping in the DB)", () => {
    const fixed = mapDiscountRow(
      discountRow({ code: "FIVEOFF", kind: "fixed", value: "5.00" }), [], NOW,
    );
    expect(fixed.kind).toBe("fixed-amount");
    expect(fixed.pct).toBeNull();
    expect(fixed.whatLabel).toBe("$5.00 off");
  });

  it("totals: given sums the list; avgPct rounds to one decimal", () => {
    const totals = discountsTotalsFrom([welcome], 10000);
    expect(totals.givenCents30d).toBe(1200);
    expect(totals.ordersCents30d).toBe(10000);
    expect(totals.avgPct).toBe(12);
    expect(discountsTotalsFrom([welcome]).avgPct).toBe(0); // unknown denominator → 0, not invented
  });
});

describe("audit / team / movements / purchase-order mapping", () => {
  it("refund audit rows carry negative money; before/after diffs surface", () => {
    const refund = mapAuditRow(
      {
        id: 60, actor_id: "u-rosa", action: "order.refund", table_name: "orders",
        row_id: "o5", before: null,
        after: { order_number: "ORD-2005", amount: 28, refunded_total: 28, reason: null },
        created_at: "2026-10-06T13:31:00Z",
      } as ShopAuditLog,
      "Rosa Delgado",
    );
    expect(refund.kind).toBe("money");
    expect(refund.moneyCents).toBe(-2800);
    expect(refund.actorName).toBe("Rosa Delgado");
    const adj = mapAuditRow(
      {
        id: 61, actor_id: null, action: "inventory.adjust", table_name: "inventory_levels",
        row_id: "v-ter", before: { quantity_on_hand: 5 }, after: { quantity_on_hand: 4 },
        created_at: "2026-10-06T14:00:00Z",
      } as ShopAuditLog,
      "System",
    );
    expect(adj.kind).toBe("stock");
    expect(adj.oldValue).toBe("5");
    expect(adj.newValue).toBe("4");
    /* With a resolved SKU the audit text names it (W-CATALOG ask). */
    const named = mapAuditRow(
      {
        id: 61, actor_id: null, action: "inventory.adjust", table_name: "inventory_levels",
        row_id: "v-ter", before: { quantity_on_hand: 5 }, after: { quantity_on_hand: 4 },
        created_at: "2026-10-06T14:00:00Z",
      } as ShopAuditLog,
      "System",
      { sku: "MUG-TER" },
    );
    expect(named.text).toContain("MUG-TER");
  });

  it("team roles map to display roles with RPC refund truth (ruling 7)", () => {
    const profile = {
      id: "u1", email: "kofi@example.com", full_name: "Kofi Mensah",
      avatar_url: null, created_at: "", updated_at: "",
    };
    expect(mapTeamMember(profile, "admin", true)).toMatchObject({ role: "Owner", refundLimitCents: null, isYou: true });
    expect(mapTeamMember(profile, "warehouse", false)).toMatchObject({ role: "Fulfillment", refundLimitCents: 0 });
    expect(mapTeamMember(profile, "support", false)).toMatchObject({ role: "Customer service", refundLimitCents: null });
  });

  it("movements format signed deltas; purchase orders map lines", () => {
    const mv = mapMovementRow(
      {
        id: "m1", variant_id: "v-mos", delta: -2, quantity_before: 3,
        quantity_after: 1, reason: "sale", reference: "ORD-2002", note: null,
        created_by: null, created_at: "2026-10-06T14:30:00Z",
      } as ShopInventoryAdjustment,
      "MUG-MOS",
    );
    expect(mv.deltaLabel).toBe("−2");
    expect(mv.text).toContain("ORD-2002");
    const po = mapPurchaseOrderRow(
      { id: "PO-0214", supplier: "Ashby Pottery", eta: "2026-10-08", status: "open", created_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" },
      [
        { id: "l1", po_id: "PO-0214", variant_id: "v-ter", sku: "MUG-TER", qty: 48 },
        { id: "l2", po_id: "PO-0214", variant_id: "v-mos", sku: "MUG-MOS", qty: 24 },
      ],
    );
    expect(po.lines.reduce((s, l) => s + l.qty, 0)).toBe(72);
    expect(po.dateISO).toBe("2026-10-08");
    expect(po.status).toBe("open");
  });

  it("average order value rounds (the $614 / 6 rule)", () => {
    expect(
      averageOrderCents({ orderCount: 6, spentCents: 61400 } as never),
    ).toBe(10233);
    expect(averageOrderCents({ orderCount: 0, spentCents: 0 } as never)).toBe(0);
  });
});
