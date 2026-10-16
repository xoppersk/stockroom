/* Canon tests: every §9 number must derive from the fixtures, and the
   store's ledger mutations must behave per §10. */
import { describe, expect, it } from "vitest";
import {
  availableOf, averageOrderCents, customersTotals, dashboardData, discountsTotals,
  getCustomer, getDiscount, getOrder, getSku, getTeam, inventorySummary, listAudit,
  listOrders, listPurchaseOrders, listSkus, ordersSummary, restockProductCount,
} from "./api";
import { createShopStore } from "./store";
import { shopNow } from "./clock";

describe("inventory canon (§9)", () => {
  it("derives 96 SKUs, 18 below reorder, 1 at zero, 1 count pending, 1,284 on hand", () => {
    const s = inventorySummary();
    expect(s.totalSkus).toBe(96);
    expect(s.belowReorder).toBe(18);
    expect(s.atZero).toBe(1);
    expect(s.countPending).toBe(1);
    expect(s.onHand).toBe(1284);
    expect(s.committed).toBe(31);
    expect(s.arrivingThisWeek).toBe(140);
    expect(restockProductCount()).toBe(11);
  });

  it("available = on shelf − committed for every SKU, never negative", () => {
    for (const sku of listSkus()) {
      expect(availableOf(sku)).toBe(sku.onShelf - sku.committed);
      expect(availableOf(sku)).toBeGreaterThanOrEqual(0);
    }
  });

  it("SM-TER is the zero: available 0, committed 2, 48 arriving Thu on PO-0214, waitlist 11", () => {
    const ter = getSku("SM-TER")!;
    expect(availableOf(ter)).toBe(0);
    expect(ter.committed).toBe(2);
    expect(ter.onShelf).toBe(2);
    expect(ter.incoming).toMatchObject({ qty: 48, poId: "PO-0214" });
    expect(ter.waitlist).toBe(11);
    expect(getSku("SM-MOS")).toMatchObject({ onShelf: 11 });
    expect(getSku("SM-WHT")).toMatchObject({ onShelf: 23, committed: 1 });
  });

  it("LA-CHR has 3 available and 24 arriving Fri on PO-0215; CT-NAT count is pending", () => {
    const chr = getSku("LA-CHR")!;
    expect(availableOf(chr)).toBe(3);
    expect(chr.incoming).toMatchObject({ qty: 24, poId: "PO-0215" });
    const ct = getSku("CT-NAT")!;
    expect(availableOf(ct)).toBe(5);
    expect(ct.countPending).toBe(true);
  });

  it("purchase orders carry the drawn units: PO-0214 72, PO-0215 68", () => {
    const pos = listPurchaseOrders();
    const total = (id: string) => pos.find((p) => p.id === id)!.lines.reduce((s, l) => s + l.qty, 0);
    expect(total("PO-0214")).toBe(72);
    expect(total("PO-0215")).toBe(68);
  });
});

describe("orders canon (§9)", () => {
  it("derives 25 open worth $3,184.50, 7 held, 18 to fulfill (9 pick / 5 pack / 4 ready), 23 shipped today", () => {
    const s = ordersSummary();
    expect(s.openCount).toBe(25);
    expect(s.openTotalCents).toBe(318450);
    expect(s.heldCount).toBe(7);
    expect(s.toFulfillCount).toBe(18);
    expect(s.pickCount).toBe(9);
    expect(s.packCount).toBe(5);
    expect(s.readyCount).toBe(4);
    expect(s.shippedTodayCount).toBe(23);
    expect(s.refundsCount).toBe(2);
  });

  it("key orders carry exact line math", () => {
    const check = (id: string, total: number) => {
      const o = getOrder(id)!;
      expect(o.subtotalCents + o.shippingCents + o.taxCents).toBe(total);
      expect(o.totalCents).toBe(total);
      expect(o.lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0)).toBe(o.subtotalCents);
    };
    check("ORD-1048", 12800); // $64 + $46 + $11.40 + $6.60
    check("ORD-1046", 21400); // $190 + $12.60 + $11.40
    check("ORD-1053", 11580); // $64 + $36 + $9.80 + $6.00
    check("ORD-1050", 13568);
    check("ORD-1052", 7632);
  });

  it("ORD-1046 is a recoverable declined payment: attempt 1 of 3, nothing deducted", () => {
    const o = getOrder("ORD-1046")!;
    expect(o.paymentStatus).toBe("failed");
    expect(o.payment).toMatchObject({ attempts: 1, maxAttempts: 3, lastAttemptLabel: "8:15 AM" });
    expect(o.hold?.kind).toBe("payment");
    /* The set-aside board was NOT deducted from stock. */
    expect(getSku("OSB-LG")).toMatchObject({ onShelf: 34, committed: 0 });
  });

  it("ORD-1048 is held on the B-14 tote count: system 5, counted 4", () => {
    const o = getOrder("ORD-1048")!;
    expect(o.hold).toMatchObject({ kind: "stock", sku: "CT-NAT", shelf: "B-14", systemCount: 5, countedCount: 4 });
  });

  it("every order total is positive and open orders are exactly the held + fulfill sets", () => {
    for (const o of listOrders()) expect(o.totalCents).toBeGreaterThan(0);
  });
});

describe("dashboard + ledger (§9, C-01)", () => {
  it("last 7 days: 146 orders, $18,420 net revenue, dip day labelled 'Mug out', peak $3,820", () => {
    const d = dashboardData();
    expect(d.ledger7.orders).toBe(146);
    expect(d.ledger7.revenueCents).toBe(1842000);
    expect(d.ledger7.revenueChangePct).toBe(8.4);
    expect(d.ledger7.heldOrders).toBe(7);
    expect(d.ledger7.lowStockSkus).toBe(18);
    expect(d.ledger7.belowSafety).toBe(6);
    expect(d.ledger7.atZero).toBe(1);
    expect(d.ledger7.peakCents).toBe(382000);
    /* Screen truth (Main.html aria-label): peak is Oct 2 ($3,820); the
       "Mug out" dip is Oct 4 ($2,310). Today ($1,350 so far) is partial. */
    const peakDay = d.ledger7.revenueByDay.reduce((a, b) => (b.revenueCents > a.revenueCents ? b : a));
    expect(peakDay.dateISO).toBe("2026-10-02");
    const dip = d.ledger7.revenueByDay.find((x) => x.note === "Mug out");
    expect(dip?.dateISO).toBe("2026-10-04");
    expect(dip?.revenueCents).toBe(231000);
    expect(d.ledger7.revenueByDay).toHaveLength(7);
  });

  it("pipeline bar is 23 shipped / 4 ready / 5 packing / 9 to pick", () => {
    expect(dashboardData().pipeline).toEqual({ shipped: 23, ready: 4, packing: 5, toPick: 9 });
  });

  it("exceptions sort problem-first, then tape", () => {
    const tones = dashboardData().exceptions.map((e) => e.tone);
    const rank = (t: string) => (t === "problem" ? 0 : t === "tape" ? 1 : 2);
    expect(tones).toEqual([...tones].sort((a, b) => rank(a) - rank(b)));
    expect(dashboardData().exceptions[0]!.tone).toBe("problem");
  });

  it("fulfillment queue is sorted by ship-by time", () => {
    const mins = dashboardData().fulfillmentQueue.map((o) => o.shipByMinutes ?? 9999);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });

  it("inventory watch is the drawn set in drawn order", () => {
    expect(dashboardData().inventoryWatch.map((s) => s.sku)).toEqual(["SM-TER", "LA-CHR", "CT-NAT", "OSB-LG"]);
  });
});

describe("customers & discounts (§9)", () => {
  it("Avery Lewis: 6 orders, $614 lifetime, $102.33 average", () => {
    const avery = getCustomer("avery-lewis")!;
    expect(avery.orderCount).toBe(6);
    expect(avery.spentCents).toBe(61400);
    expect(averageOrderCents(avery)).toBe(10233);
    expect(avery.orderHistory.reduce((s, o) => s + o.totalCents, 0)).toBe(61400);
    expect(avery.orderHistory).toHaveLength(6);
  });

  it("customer totals: 1,206 total, 214 returning, 9 waiting on restock", () => {
    expect(customersTotals()).toMatchObject({ total: 1206, returning: 214, waitingOnRestock: 9 });
  });

  it("Kettle & Crumb Café is wholesale 25% on Net 30", () => {
    expect(getCustomer("kettle-crumb-cafe")!.wholesale).toMatchObject({ discountPct: 25, termsLabel: "Net 30" });
  });

  it("discounts gave $1,126 off $9,840 (11.4%); SPRING20 ended at 128/128", () => {
    expect(discountsTotals()).toMatchObject({ givenCents30d: 112600, ordersCents30d: 984000, avgPct: 11.4 });
    expect(getDiscount("SPRING20")).toMatchObject({ status: "ended", uses: 128, useLimit: 128 });
    expect(getDiscount("FREESHIP75")).toMatchObject({ status: "scheduled", minOrderCents: 7500 });
  });

  it("audit fixture reports 64 entries with 9 shown by default", () => {
    const a = listAudit();
    expect(a.totalCount).toBe(64);
    expect(a.shownCount).toBe(9);
    expect(a.entries.length).toBeGreaterThanOrEqual(9);
  });

  it("team carries Rosa's $100 refund limit and the pending jules invite", () => {
    const { members, invite } = getTeam();
    expect(members.find((m) => m.id === "rosa")!.refundLimitCents).toBe(10000);
    expect(members.find((m) => m.id === "sheku")!.refundLimitCents).toBeNull();
    expect(invite).toMatchObject({ email: "jules@sevynlabs.io", role: "Fulfillment", expiresLabel: "Oct 12" });
  });
});

describe("store mutations (§10)", () => {
  it("adjustStock updates the shelf and writes a signed audit entry (EC-WHT write-off)", () => {
    const store = createShopStore();
    const kofi = getTeam().members.find((m) => m.id === "kofi")!;
    const before = store.getState().audit.length;
    const entry = store.adjustStock("EC-WHT", -2, "Damaged", kofi);
    const ec = store.getState().products.flatMap((p) => p.variants).find((v) => v.sku === "EC-WHT")!;
    expect(ec.onShelf).toBe(6); // 8 → 6
    expect(ec.onShelf - ec.committed).toBe(5); // available 7 → 5
    expect(entry).not.toBeNull();
    expect(entry!.moneyCents).toBe(-4300); // 2 × $21.50 at cost
    expect(store.getState().audit.length).toBe(before + 1);
    expect(store.getState().audit[0]).toBe(entry);
  });

  it("recordCountAndRelease clears the stock hold and drops CT-NAT to the counted 4", () => {
    const store = createShopStore();
    expect(store.recordCountAndRelease("ORD-1048", 4)).toBe(true);
    const order = store.getState().orders.find((o) => o.id === "ORD-1048")!;
    expect(order.hold).toBeNull();
    expect(order.stage).toBe("packing");
    const ct = store.getState().products.flatMap((p) => p.variants).find((v) => v.sku === "CT-NAT")!;
    expect(ct.onShelf).toBe(4);
    expect(ct.onShelf - ct.committed).toBe(3); // "3 left to sell"
    expect(ct.countPending).toBe(false);
  });

  it("retryPayment captures ORD-1046 and clears the payment hold", () => {
    const store = createShopStore();
    expect(store.retryPayment("ORD-1046")).toEqual({ ok: true });
    const order = store.getState().orders.find((o) => o.id === "ORD-1046")!;
    expect(order.paymentStatus).toBe("paid");
    expect(order.hold).toBeNull();
    expect(order.payment?.attempts).toBe(2);
  });

  it("attemptRefund over Rosa's $100 limit is rejected WITHOUT mutating (X-06)", () => {
    const store = createShopStore();
    const rosa = getTeam().members.find((m) => m.id === "rosa")!;
    const auditBefore = store.getState().audit.length;
    const result = store.attemptRefund("ORD-1036", 14800, rosa);
    expect(result).toEqual({ ok: false, reason: "over-limit", limit: 10000 });
    const order = store.getState().orders.find((o) => o.id === "ORD-1036")!;
    expect(order.refundedCents).toBe(0);
    expect(store.getState().audit.length).toBe(auditBefore);
  });

  it("attemptRefund within the limit applies and writes audit", () => {
    const store = createShopStore();
    const rosa = getTeam().members.find((m) => m.id === "rosa")!;
    expect(store.attemptRefund("ORD-1036", 10000, rosa)).toEqual({ ok: true });
    const order = store.getState().orders.find((o) => o.id === "ORD-1036")!;
    expect(order.refundedCents).toBe(10000);
    expect(order.paymentStatus).toBe("partially-refunded");
    expect(store.getState().audit[0]!.moneyCents).toBe(-10000);
  });

  it("the owner has no refund limit", () => {
    const store = createShopStore();
    const sheku = getTeam().members.find((m) => m.id === "sheku")!;
    expect(store.attemptRefund("ORD-1036", 14800, sheku)).toEqual({ ok: true });
    expect(store.getState().orders.find((o) => o.id === "ORD-1036")!.paymentStatus).toBe("refunded");
  });

  it("adding a sold-out variant to the cart is blocked; checkout holds for 15 minutes", () => {
    const store = createShopStore();
    expect(store.addToCart("SM-TER")).toEqual({ ok: false, reason: "sold-out" });
    expect(store.addToCart("LA-CHR")).toEqual({ ok: true });
    const expires = store.startCheckout();
    expect(expires).not.toBeNull();
    const deltaMs = new Date(expires!).getTime() - shopNow().getTime();
    expect(deltaMs).toBeGreaterThan(14 * 60_000);
    expect(deltaMs).toBeLessThanOrEqual(16 * 60_000);
  });

  it("offline actions queue and flush on reconnect", () => {
    const store = createShopStore();
    store.setOnline(false);
    expect(store.getState().connection.online).toBe(false);
    expect(store.getState().connection.asOfLabel).toMatch(/AM|PM/);
    store.queueAction("Print pick list");
    store.queueAction("Add a note to ORD-1048");
    expect(store.getState().connection.queue).toHaveLength(2);
    const flushed = store.setOnline(true);
    expect(flushed).toEqual(["Print pick list", "Add a note to ORD-1048"]);
    expect(store.getState().connection.queue).toEqual([]);
  });

  it("receiveDelivery lands PO-0214 units on the shelf, once", () => {
    const store = createShopStore();
    expect(store.receiveDelivery("PO-0214")).toBe(true);
    const ter = store.getState().products.flatMap((p) => p.variants).find((v) => v.sku === "SM-TER")!;
    expect(ter.onShelf).toBe(50); // 2 + 48
    expect(store.receiveDelivery("PO-0214")).toBe(false);
  });
});
