import { describe, expect, it } from "vitest";

import { formatCompactMoney, formatMoney, fromCents, toCents } from "./money";

/**
 * Money helper edge cases (Phase 10 QA).
 *
 * Postgres `numeric(12,2)` arrives from PostgREST as a string, so every
 * helper accepts `string | number`. All arithmetic goes through integer
 * cents to avoid floating-point drift.
 */
describe("formatMoney", () => {
  it("formats string numerics from Postgres", () => {
    expect(formatMoney("1234.5")).toBe("$1,234.50");
    expect(formatMoney("0")).toBe("$0.00");
  });

  it("formats numbers", () => {
    expect(formatMoney(9.99)).toBe("$9.99");
  });

  it("falls back to $0.00 on bad input instead of throwing", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
    expect(formatMoney("abc")).toBe("$0.00");
    expect(formatMoney("")).toBe("$0.00");
    expect(formatMoney(Number.NaN)).toBe("$0.00");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });

  it("formats negatives", () => {
    expect(formatMoney("-1234.5")).toBe("-$1,234.50");
  });
});

describe("toCents", () => {
  it("converts dollars to integer cents", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents("0")).toBe(0);
  });

  it("rounds half cents (Math.round, half up)", () => {
    expect(toCents("12.345")).toBe(1235);
    expect(toCents("12.344")).toBe(1234);
  });

  it("returns 0 for bad input", () => {
    expect(toCents("abc")).toBe(0);
    expect(toCents(Number.NaN)).toBe(0);
  });
});

describe("fromCents", () => {
  it("formats integer cents as a numeric-column string", () => {
    expect(fromCents(1234)).toBe("12.34");
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(0)).toBe("0.00");
    expect(fromCents(-250)).toBe("-2.50");
  });

  it("rounds fractional cent inputs", () => {
    expect(fromCents(12.6)).toBe("0.13");
  });

  it("round-trips with toCents", () => {
    expect(toCents(fromCents(9876))).toBe(9876);
  });
});

describe("formatCompactMoney", () => {
  it("compacts large values for dense dashboard labels", () => {
    expect(formatCompactMoney(1_200_000)).toBe("$1.2M");
    expect(formatCompactMoney(1500)).toBe("$1.5K");
  });

  it("returns $0 for bad input", () => {
    expect(formatCompactMoney(null)).toBe("$0");
    expect(formatCompactMoney(undefined)).toBe("$0");
    expect(formatCompactMoney("nope")).toBe("$0");
  });
});
