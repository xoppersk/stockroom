import { describe, expect, it } from "vitest";

import {
  computeCartSubtotal,
  computeCartTotals,
  computeDiscountAmount,
} from "./totals";

/**
 * Cart total tests (Phase 10 QA).
 *
 * Prices are never stored on cart rows — totals are computed live from
 * `product_variants.price` (Postgres `numeric(12,2)` arrives as a string).
 * These pin the pure math that `getCartDetails` and the checkout flow share,
 * including the SQL `create_checkout_session` rounding rules.
 */
describe("computeCartSubtotal", () => {
  it("sums quantity × live price across lines", () => {
    expect(
      computeCartSubtotal([
        { unitPrice: "24.99", quantity: 2 },
        { unitPrice: 10, quantity: 1 },
      ]),
    ).toBe(59.98);
  });

  it("accepts numeric prices too", () => {
    expect(computeCartSubtotal([{ unitPrice: 5.5, quantity: 4 }])).toBe(22);
  });

  it("returns 0 for an empty cart", () => {
    expect(computeCartSubtotal([])).toBe(0);
  });

  it("rounds to cents (floating-point drift from live prices must not leak)", () => {
    // 0.1 + 0.2 style drift: 19.99 * 3 = 59.970000000000006 in floats.
    expect(computeCartSubtotal([{ unitPrice: "19.99", quantity: 3 }])).toBe(59.97);
  });
});

describe("computeDiscountAmount", () => {
  it("computes a percentage discount rounded to cents", () => {
    expect(computeDiscountAmount(120, "percentage", 10)).toBe(12);
    // SQL: round(subtotal * value / 100, 2)
    expect(computeDiscountAmount(59.99, "percentage", 15)).toBe(9);
  });

  it("caps a fixed discount at the subtotal (never negative)", () => {
    expect(computeDiscountAmount(40, "fixed", 100)).toBe(40);
    expect(computeDiscountAmount(40, "fixed", "25.50")).toBe(25.5);
  });

  it("accepts string values from Postgres numeric columns", () => {
    expect(computeDiscountAmount(200, "percentage", "12.5")).toBe(25);
  });

  it("returns 0 for invalid inputs", () => {
    expect(computeDiscountAmount(100, "percentage", "abc")).toBe(0);
    expect(computeDiscountAmount(100, "percentage", -5)).toBe(0);
    expect(computeDiscountAmount(0, "fixed", 10)).toBe(0);
  });
});

describe("computeCartTotals", () => {
  const lines = [
    { unitPrice: "24.99", quantity: 2 },
    { unitPrice: "10.00", quantity: 1 },
  ];

  it("totals a cart with no discount", () => {
    expect(computeCartTotals(lines)).toEqual({
      subtotal: 59.98,
      discountTotal: 0,
      total: 59.98,
    });
  });

  it("applies a percentage discount", () => {
    const t = computeCartTotals(lines, { kind: "percentage", value: 10 });
    expect(t.subtotal).toBe(59.98);
    expect(t.discountTotal).toBe(6); // round(59.98 * 10 / 100, 2)
    expect(t.total).toBe(53.98);
  });

  it("applies a fixed discount", () => {
    const t = computeCartTotals(lines, { kind: "fixed", value: "20" });
    expect(t).toEqual({ subtotal: 59.98, discountTotal: 20, total: 39.98 });
  });

  it("never produces a negative total when the discount exceeds the subtotal", () => {
    const t = computeCartTotals([{ unitPrice: "5.00", quantity: 1 }], {
      kind: "fixed",
      value: 50,
    });
    expect(t.discountTotal).toBe(5);
    expect(t.total).toBe(0);
  });

  it("handles an empty cart", () => {
    expect(computeCartTotals([])).toEqual({ subtotal: 0, discountTotal: 0, total: 0 });
  });
});
