import { describe, expect, it } from "vitest";

import { deriveDiscountStatus, type DiscountStatusInput } from "./status";

/**
 * Derived discount status tests (Phase 10 QA).
 *
 * The stored `status` column is only 'active' | 'paused'; the effective
 * state (Active / Scheduled / Paused / Expired) is derived at read time per
 * DATABASE-SCHEMA.md §discounts. `now` is injected so every branch is
 * deterministic.
 */
const NOW = new Date("2026-10-06T12:00:00Z");
const PAST = "2026-09-01T00:00:00Z";
const FUTURE = "2026-12-01T00:00:00Z";

function discount(overrides: Partial<DiscountStatusInput> = {}): DiscountStatusInput {
  return {
    status: "active",
    starts_at: PAST,
    ends_at: null,
    usage_limit: null,
    ...overrides,
  };
}

describe("deriveDiscountStatus", () => {
  it("is Active for a live code inside its window", () => {
    expect(deriveDiscountStatus(discount(), 0, NOW)).toBe("Active");
  });

  it("is Active with an open-ended window and no usage limit", () => {
    expect(
      deriveDiscountStatus(discount({ ends_at: null, usage_limit: null }), 999, NOW),
    ).toBe("Active");
  });

  it("is Scheduled when now is before starts_at", () => {
    expect(deriveDiscountStatus(discount({ starts_at: FUTURE }), 0, NOW)).toBe("Scheduled");
  });

  it("is Paused when the stored status is paused", () => {
    expect(deriveDiscountStatus(discount({ status: "paused" }), 0, NOW)).toBe("Paused");
  });

  it("prefers Paused over Scheduled and Expired (admin action wins)", () => {
    expect(
      deriveDiscountStatus(discount({ status: "paused", starts_at: FUTURE }), 0, NOW),
    ).toBe("Paused");
    expect(
      deriveDiscountStatus(
        discount({ status: "paused", ends_at: "2026-01-01T00:00:00Z" }),
        0,
        NOW,
      ),
    ).toBe("Paused");
  });

  it("pausing mid-campaign stops redemption immediately", () => {
    // A code that was Active a minute ago reads Paused the moment the admin flips it.
    expect(deriveDiscountStatus(discount(), 0, NOW)).toBe("Active");
    expect(deriveDiscountStatus(discount({ status: "paused" }), 0, NOW)).toBe("Paused");
  });

  it("is Expired when ends_at is in the past", () => {
    expect(
      deriveDiscountStatus(discount({ ends_at: "2026-10-01T00:00:00Z" }), 0, NOW),
    ).toBe("Expired");
  });

  it("is Expired when the usage limit is reached", () => {
    expect(deriveDiscountStatus(discount({ usage_limit: 100 }), 100, NOW)).toBe("Expired");
    expect(deriveDiscountStatus(discount({ usage_limit: 100 }), 150, NOW)).toBe("Expired");
  });

  it("stays Active when redemptions are below the usage limit", () => {
    expect(deriveDiscountStatus(discount({ usage_limit: 100 }), 99, NOW)).toBe("Active");
  });

  it("a null usage limit means unlimited (never usage-expired)", () => {
    expect(deriveDiscountStatus(discount({ usage_limit: null }), 10_000, NOW)).toBe("Active");
  });

  it("usage-exhausted beats the date window", () => {
    expect(
      deriveDiscountStatus(discount({ ends_at: FUTURE, usage_limit: 1 }), 1, NOW),
    ).toBe("Expired");
  });

  it("Scheduled beats Expired when the window hasn't opened yet", () => {
    // now < starts_at is checked before ends_at, per the documented order.
    expect(
      deriveDiscountStatus(
        discount({ starts_at: FUTURE, ends_at: "2026-01-01T00:00:00Z" }),
        0,
        NOW,
      ),
    ).toBe("Scheduled");
  });
});
