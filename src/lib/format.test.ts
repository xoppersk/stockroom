import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatDiscountValue, formatMoney } from "./format";

/**
 * Admin formatting edge cases (Phase 10 QA).
 *
 * Date assertions build the Date from local components so they hold in any
 * runner timezone (timestamptz values from the DB carry their own offset).
 */
describe("formatMoney", () => {
  it("formats string and number numerics", () => {
    expect(formatMoney("1234.5")).toBe("$1,234.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("returns $0.00 for null/undefined/NaN strings", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
    expect(formatMoney("abc")).toBe("$0.00");
  });

  it("formats negatives", () => {
    expect(formatMoney("-5")).toBe("-$5.00");
  });
});

describe("formatDate", () => {
  it("renders the compact table-cell date", () => {
    const d = new Date(2026, 0, 4, 15, 30); // local components — TZ-independent
    expect(formatDate(d.toISOString())).toBe("Jan 4, 2026");
  });

  it("renders an em dash for missing or invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("renders the full detail-header datetime", () => {
    const d = new Date(2026, 0, 4, 15, 4);
    expect(formatDateTime(d.toISOString())).toBe("Jan 4, 2026, 3:04 PM");
  });

  it("renders an em dash for missing or invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("garbage")).toBe("—");
  });
});

describe("formatDiscountValue", () => {
  it("renders percentage codes without trailing decimals", () => {
    expect(formatDiscountValue("percentage", 10)).toBe("10% off");
    expect(formatDiscountValue("percentage", "10")).toBe("10% off");
  });

  it("keeps fractional percentages", () => {
    expect(formatDiscountValue("percentage", 12.5)).toBe("12.5% off");
  });

  it("renders fixed codes as money", () => {
    expect(formatDiscountValue("fixed", 5)).toBe("$5.00 off");
    expect(formatDiscountValue("fixed", "25.5")).toBe("$25.50 off");
  });
});
