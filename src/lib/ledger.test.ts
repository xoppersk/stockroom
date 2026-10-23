/* Ledger tests, rewritten for the console DB rewire.
 *
 * The old suite asserted canon numbers drawn from the v2 FIXTURES
 * (96 SKUs / 25 open orders / $18,420 week …). Those counts were
 * properties of the drawn dataset, not of the code. This suite asserts
 * the same DERIVATIONS and INVARIANTS over a small hand-built view
 * dataset whose expectations are computed by hand in the comments;
 * DB-row → view mapping is covered by src/lib/shop/admin.test.ts, and
 * the store-mutation behaviours that used to live in lib/store.tsx are
 * mapped in the W-DATA log's test-mapping table (ported / PGlite /
 * demo-theatre) — no assertion was silently dropped.
 */
import { describe, expect, it } from "vitest";
import {
  availableOf,
  averageOrderCents,
  customersTotalsFrom,
  dashboardFromData,
  deriveDiscountStatus,
  deriveRefundStatus,
  discountsTotalsFrom,
  getSku,
  heldOrders,
  inventorySummary,
  isBelowReorder,
  isOpenOrder,
  listSkus,
  ordersSummary,
  restockProductCount,
} from "./derive";
import type { Customer, Discount, Order, Product, RevenueDay } from "./types";

/* ---------------- hand-built view dataset ----------------
 * SKUs: A-1 avail 3 (below reorder 5) · A-2 avail 0 · B-1 avail 7 ·
 *       Z-9 archived avail 0 (excluded from live tallies)
 * Orders: O-1 open to-pick $100 · O-2 open held $50 · O-3 open packing
 *         $30 · O-4 shipped today $80 · O-5 delivered $60 ·
 *         O-6 open ready $20, partially refunded
 * Open = O-1,O-2,O-3,O-6 → 4 open, $200 total, 1 held, 3 to fulfill
 * (1 pick / 1 pack / 1 ready). */

const PRODUCTS: Product[] = [
  {
    slug: "alpha", name: "Alpha", collection: "C1", status: "active",
    priceCents: 1000, sold30d: 9, storefront: "Visible", backorder: false,
    supplier: null, description: null,
    variants: [
      { sku: "A-1", label: "One", shelf: "S-1", onShelf: 8, committed: 5, reorderPoint: 5, priceCents: 1000, costCents: 400 },
      { sku: "A-2", label: "Two", shelf: "S-1", onShelf: 4, committed: 4, reorderPoint: 6, priceCents: 1000, costCents: 400, safetyPoint: 2 },
    ],
  },
  {
    slug: "beta", name: "Beta", collection: "C1", status: "active",
    priceCents: 2000, sold30d: 3, storefront: "Visible", backorder: false,
    supplier: null, description: null,
    variants: [
      { sku: "B-1", label: "One", shelf: "S-2", onShelf: 9, committed: 2, reorderPoint: 3, priceCents: 2000, costCents: null },
    ],
  },
  {
    slug: "zed", name: "Zed", collection: "C2", status: "archived",
    priceCents: 500, sold30d: 0, storefront: "Hidden", backorder: false,
    supplier: null, description: null,
    variants: [
      { sku: "Z-9", label: "Old", shelf: "", onShelf: 0, committed: 0, reorderPoint: 5, priceCents: 500, costCents: null },
    ],
  },
];

function order(p: Partial<Order> & { id: string }): Order {
  return {
    uuid: `uuid-${p.id}`, customerSlug: null, customerName: "Test",
    placedLabel: "Oct 6", placedDay: "today", channel: "online",
    stage: "to-pick", stageLabel: "To pick", shipByLabel: "2:00 PM",
    shipByMinutes: 840, lines: [{ sku: "A-1", label: "Alpha — One", qty: 1, unitPriceCents: 1000 }],
    subtotalCents: 1000, shippingCents: 0, taxCents: 0, totalCents: 1000,
    paymentStatus: "paid", hold: null, refundedCents: 0, ...p,
  };
}
const ORDERS: Order[] = [
  order({ id: "O-1", totalCents: 10000, subtotalCents: 10000, shipByMinutes: 900 }),
  order({
    id: "O-2", totalCents: 5000, subtotalCents: 5000, stage: "held", stageLabel: "Stock hold",
    hold: { kind: "stock", tone: "tape", title: "Stock hold", reason: "Short.", sku: "A-2" },
  }),
  order({ id: "O-3", totalCents: 3000, subtotalCents: 3000, stage: "packing", stageLabel: "Packing", shipByMinutes: 300 }),
  order({ id: "O-4", totalCents: 8000, subtotalCents: 8000, stage: "shipped", stageLabel: "Shipped" }),
  order({ id: "O-5", totalCents: 6000, subtotalCents: 6000, stage: "delivered", stageLabel: "Delivered", placedDay: "earlier" }),
  order({ id: "O-6", totalCents: 2000, subtotalCents: 2000, stage: "ready", stageLabel: "Ready", paymentStatus: "partially-refunded", refundedCents: 500, shipByMinutes: 600 }),
];

describe("inventory derivations", () => {
  it("available = onShelf − committed, and below-reorder uses available", () => {
    const skus = listSkus(PRODUCTS);
    for (const s of skus) {
      expect(availableOf(s)).toBe(s.onShelf - s.committed);
      expect(availableOf(s)).toBeGreaterThanOrEqual(0);
    }
    expect(isBelowReorder(skus.find((s) => s.sku === "A-1")!)).toBe(true); // 3 < 5
    expect(isBelowReorder(skus.find((s) => s.sku === "B-1")!)).toBe(false); // 7 ≥ 3
  });

  it("summary tallies exclude archived SKUs from live counts only", () => {
    const s = inventorySummary(listSkus(PRODUCTS), 25);
    expect(s.totalSkus).toBe(4);
    expect(s.belowReorder).toBe(2); // A-1, A-2 — not Z-9
    expect(s.atZero).toBe(1); // A-2 — not Z-9
    expect(s.onHand).toBe(21); // 8+4+9+0, all SKUs
    expect(s.committed).toBe(11); // 5+4+2+0
    expect(s.arrivingThisWeek).toBe(25); // the parameter, verbatim
    expect(restockProductCount(PRODUCTS)).toBe(1); // Alpha only
  });

  it("getSku(list, code) finds by code across products", () => {
    expect(getSku(PRODUCTS, "B-1")?.productSlug).toBe("beta");
    expect(getSku(PRODUCTS, "NOPE")).toBeUndefined();
    expect(listSkus(PRODUCTS)).toHaveLength(4);
  });
});

describe("order derivations", () => {
  it("open set is exactly held + fulfill; stages partition the summary", () => {
    const s = ordersSummary(ORDERS);
    expect(s.openCount).toBe(4);
    expect(s.openTotalCents).toBe(20000);
    expect(s.heldCount).toBe(1);
    expect(s.toFulfillCount).toBe(3);
    expect(s.openCount).toBe(s.heldCount + s.toFulfillCount);
    expect(s.pickCount).toBe(1);
    expect(s.packCount).toBe(1);
    expect(s.readyCount).toBe(1);
    expect(s.shippedTodayCount).toBe(1); // O-4 shipped + placed today
    expect(s.refundsCount).toBe(1); // O-6 partially refunded
    expect(heldOrders(ORDERS).map((o) => o.id)).toEqual(["O-2"]);
    expect(ORDERS.filter(isOpenOrder).map((o) => o.id)).toEqual(["O-1", "O-2", "O-3", "O-6"]);
  });

  it("refund status derives from money alone", () => {
    expect(deriveRefundStatus(0, 5000)).toBeNull();
    expect(deriveRefundStatus(1, 5000)).toBe("partially-refunded");
    expect(deriveRefundStatus(4999, 5000)).toBe("partially-refunded");
    expect(deriveRefundStatus(5000, 5000)).toBe("refunded");
    expect(deriveRefundStatus(6000, 5000)).toBe("refunded");
  });
});

describe("dashboard derivation", () => {
  const days: RevenueDay[] = [
    { dateISO: "2026-09-30", dateLabel: "Sep 30", dayLabel: "30", orders: 10, revenueCents: 100000 },
    { dateISO: "2026-10-01", dateLabel: "Oct 1", dayLabel: "1", orders: 10, revenueCents: 100000 },
    { dateISO: "2026-10-02", dateLabel: "Oct 2", dayLabel: "2", orders: 10, revenueCents: 300000 },
    { dateISO: "2026-10-03", dateLabel: "Oct 3", dayLabel: "3", orders: 10, revenueCents: 100000 },
    { dateISO: "2026-10-04", dateLabel: "Oct 4", dayLabel: "4", orders: 10, revenueCents: 50000, note: "Mug out" },
    { dateISO: "2026-10-05", dateLabel: "Oct 5", dayLabel: "5", orders: 10, revenueCents: 100000 },
    { dateISO: "2026-10-06", dateLabel: "Oct 6", dayLabel: "Today", orders: 10, revenueCents: 100000 },
  ];
  const dash = dashboardFromData({
    orders: ORDERS,
    skus: listSkus(PRODUCTS),
    days,
    shop: {
      days, todayLabel: "Tue, Oct 6", dayHeroLabel: "Tuesday, October 6",
      cutoffLabel: "2:00 PM", rangeLabel: "Sep 30 – Oct 6",
      prevRevenueCents: 850000, prevOrders: 60,
    },
  });

  it("ledger7 sums the days; change figures compare against the previous period", () => {
    expect(dash.ledger7.orders).toBe(70);
    expect(dash.ledger7.revenueCents).toBe(850000);
    expect(dash.ledger7.revenueChangePct).toBe(0);
    expect(dash.ledger7.ordersVsLastWeek).toBe(10);
    expect(dash.ledger7.peakCents).toBe(300000);
    const peak = dash.ledger7.revenueByDay.reduce((a, b) => (b.revenueCents > a.revenueCents ? b : a));
    expect(peak.dateISO).toBe("2026-10-02");
    expect(dash.ledger7.revenueByDay.find((d) => d.note === "Mug out")?.dateISO).toBe("2026-10-04");
    expect(dash.ledger7.belowSafety).toBe(1); // A-2: available 0 ≤ safety 2
  });

  it("pipeline comes from the orders summary", () => {
    expect(dash.pipeline).toEqual({ shipped: 1, ready: 1, packing: 1, toPick: 1 });
    expect(dash.toGoToday).toBe(3);
  });

  it("exceptions sort problem-first, then tape; queue sorts by ship-by", () => {
    const tones = dash.exceptions.map((e) => e.tone);
    const rank = (t: string) => (t === "problem" ? 0 : t === "tape" ? 1 : 2);
    expect(tones).toEqual([...tones].sort((a, b) => rank(a) - rank(b)));
    expect(dash.exceptions[0]!.tone).toBe("problem"); // sold-out A-2
    const mins = dash.fulfillmentQueue.map((o) => o.shipByMinutes ?? 9999);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(dash.fulfillmentQueue.map((o) => o.id)).toEqual(["O-3", "O-6", "O-1"]);
  });
});

describe("customer + discount derivations", () => {
  it("average order value rounds; zero orders average zero", () => {
    expect(averageOrderCents({ orderCount: 6, spentCents: 61400 } as Customer)).toBe(10233);
    expect(averageOrderCents({ orderCount: 3, spentCents: 10000 } as Customer)).toBe(3333);
    expect(averageOrderCents({ orderCount: 0, spentCents: 0 } as Customer)).toBe(0);
  });

  it("customers totals count the list itself", () => {
    const list = [
      { orderCount: 6, waitingFor: null, type: "customer" },
      { orderCount: 1, waitingFor: { sku: "A-2", productName: "Alpha", note: "" }, type: "customer" },
      { orderCount: 14, waitingFor: null, type: "wholesale" },
    ] as unknown as Customer[];
    expect(customersTotalsFrom(list, 4)).toEqual({
      total: 3, returning: 2, waitingOnRestock: 1, wholesale: 1, openOrders: 4,
    });
    expect(customersTotalsFrom(list).openOrders).toBe(0); // not derivable from rows alone
  });

  it("discount status derivation covers every branch", () => {
    const now = new Date("2026-10-06T14:48:00Z");
    const base = { status: "active", startsAt: "2026-10-01T00:00:00Z", endsAt: null, uses: 0, useLimit: null, now };
    expect(deriveDiscountStatus(base).status).toBe("running");
    expect(deriveDiscountStatus({ ...base, status: "paused" })).toEqual({ status: "ended", paused: true, endedReason: "Paused" });
    expect(deriveDiscountStatus({ ...base, endsAt: "2026-10-05T00:00:00Z" }).status).toBe("ended");
    expect(deriveDiscountStatus({ ...base, startsAt: "2026-10-07T00:00:00Z" }).status).toBe("scheduled");
    expect(deriveDiscountStatus({ ...base, uses: 5, useLimit: 5 }).endedReason).toBe("Ended at its 5-use limit");
  });

  it("discount totals sum given; avgPct needs a real denominator", () => {
    const list = [
      { givenCents30d: 112600 },
      { givenCents30d: 0 },
    ] as unknown as Discount[];
    expect(discountsTotalsFrom(list, 984000)).toEqual({
      givenCents30d: 112600, ordersCents30d: 984000, avgPct: 11.4,
    });
    expect(discountsTotalsFrom(list).avgPct).toBe(0);
  });
});
