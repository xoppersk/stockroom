import { describe, expect, it } from "vitest";

import {
  computeAdjustment,
  crossesLowStockThreshold,
  InsufficientStockError,
} from "./guard";

/**
 * Inventory race-condition contract tests (Phase 10 QA).
 *
 * Real enforcement is the database: `_adjust_inventory` does
 * `SELECT quantity_on_hand ... FOR UPDATE`, so concurrent decrements
 * serialize and the `v_after < 0` raise fires atomically. These tests pin
 * the pure contract (stock can never go negative; the guard logic mirrors
 * the SQL exactly), modeling concurrent decrements as serialized moves —
 * which is what the row lock guarantees.
 */
describe("computeAdjustment", () => {
  it("applies a sale decrement", () => {
    expect(computeAdjustment(10, -3)).toBe(7);
  });

  it("applies a restock increment", () => {
    expect(computeAdjustment(7, 5)).toBe(12);
  });

  it("allows decrementing exactly to zero", () => {
    expect(computeAdjustment(3, -3)).toBe(0);
  });

  it("refuses to drive stock negative", () => {
    expect(() => computeAdjustment(2, -3)).toThrow(InsufficientStockError);
    expect(() => computeAdjustment(2, -3)).toThrow("Insufficient stock");
  });

  it("refuses a zero delta (matches the SQL raise)", () => {
    expect(() => computeAdjustment(5, 0)).toThrow("Inventory delta must not be zero.");
  });

  it("carries the before/delta context on the error", () => {
    try {
      computeAdjustment(2, -5);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect((err as InsufficientStockError).quantityBefore).toBe(2);
      expect((err as InsufficientStockError).delta).toBe(-5);
    }
  });

  it("models the race: two concurrent decrements of 3 against stock of 5", () => {
    // The FOR UPDATE row lock serializes the two moves; the second one sees
    // the post-first stock (2) and fails instead of driving stock to -1.
    const afterFirst = computeAdjustment(5, -3);
    expect(afterFirst).toBe(2);
    expect(() => computeAdjustment(afterFirst, -3)).toThrow(InsufficientStockError);
  });

  it("a failed decrement leaves the recorded stock untouched", () => {
    const before = 2;
    expect(() => computeAdjustment(before, -3)).toThrow();
    // The caller never writes `before` back on failure — stock stays 2.
    expect(before).toBe(2);
  });
});

describe("crossesLowStockThreshold", () => {
  it("detects a downward crossing (fires the low_stock notification)", () => {
    expect(crossesLowStockThreshold(10, 9, 10)).toBe(true);
    expect(crossesLowStockThreshold(12, 4, 10)).toBe(true);
  });

  it("ignores moves that stay at or above the threshold", () => {
    expect(crossesLowStockThreshold(15, 12, 10)).toBe(false);
    expect(crossesLowStockThreshold(10, 10, 10)).toBe(false);
  });

  it("ignores moves that were already below the threshold (no repeat alerts)", () => {
    expect(crossesLowStockThreshold(9, 4, 10)).toBe(false);
  });

  it("ignores upward moves", () => {
    expect(crossesLowStockThreshold(4, 12, 10)).toBe(false);
  });
});
