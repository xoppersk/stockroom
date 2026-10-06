import { describe, expect, it } from "vitest";

import {
  canApplyTransition,
  mapStripeEventToTransition,
  type StripeOrderTransition,
} from "./event-dispatch";

/**
 * Declined-card + state-machine mapping tests (Phase 10 QA).
 *
 * These assert the pure mapping that mirrors `handle_stripe_event`
 * (migration 00009): a `payment_intent.payment_failed` payload must drive
 * the order to `failed` — never touching stock — while success drives
 * `paid` with a stock decrement. The DB function stays the source of truth;
 * this is its testable shadow.
 */
describe("mapStripeEventToTransition", () => {
  it("maps payment_intent.payment_failed to a failed order and failed payment", () => {
    const t = mapStripeEventToTransition("payment_intent.payment_failed");
    expect(t).toEqual({
      paymentStatus: "failed",
      orderStatus: "failed",
      orderEventType: "payment_failed",
      decrementsStock: false,
    });
  });

  it("maps checkout.session.completed to paid with a stock decrement", () => {
    const t = mapStripeEventToTransition("checkout.session.completed");
    expect(t).toMatchObject({
      paymentStatus: "succeeded",
      orderStatus: "paid",
      orderEventType: "payment_succeeded",
      decrementsStock: true,
    });
  });

  it("maps payment_intent.succeeded to paid with a stock decrement", () => {
    const t = mapStripeEventToTransition("payment_intent.succeeded");
    expect(t).toMatchObject({ orderStatus: "paid", paymentStatus: "succeeded" });
  });

  it("maps a full charge.refunded to refunded", () => {
    const t = mapStripeEventToTransition("charge.refunded", {
      amountRefunded: 5000,
      amount: 5000,
    });
    expect(t).toMatchObject({
      paymentStatus: "refunded",
      orderStatus: "refunded",
      orderEventType: "refund_issued",
      decrementsStock: false,
    });
  });

  it("maps a partial charge.refunded to partially_refunded", () => {
    const t = mapStripeEventToTransition("charge.refunded", {
      amountRefunded: 2000,
      amount: 5000,
    });
    expect(t).toMatchObject({ paymentStatus: "partially_refunded", orderStatus: "refunded" });
  });

  it("returns null for unknown event types (recorded, not dispatched)", () => {
    expect(mapStripeEventToTransition("invoice.payment_succeeded")).toBeNull();
    expect(mapStripeEventToTransition("customer.created")).toBeNull();
    expect(mapStripeEventToTransition("")).toBeNull();
  });
});

describe("canApplyTransition (forward-only guard)", () => {
  const failed: StripeOrderTransition = mapStripeEventToTransition(
    "payment_intent.payment_failed",
  )!;
  const paid: StripeOrderTransition = mapStripeEventToTransition("checkout.session.completed")!;
  const refunded: StripeOrderTransition = mapStripeEventToTransition("charge.refunded")!;

  it("applies the failed transition only while the order is pending", () => {
    expect(canApplyTransition("pending", failed)).toBe(true);
    // A duplicate/out-of-order failure for an already-paid order must not regress it.
    expect(canApplyTransition("paid", failed)).toBe(false);
    expect(canApplyTransition("failed", failed)).toBe(false);
  });

  it("applies the paid transition only while the order is pending", () => {
    expect(canApplyTransition("pending", paid)).toBe(true);
    // A retried success event for an already-paid order is a no-op.
    expect(canApplyTransition("paid", paid)).toBe(false);
    expect(canApplyTransition("failed", paid)).toBe(false);
  });

  it("applies refunds only to paid or fulfilled orders", () => {
    expect(canApplyTransition("paid", refunded)).toBe(true);
    expect(canApplyTransition("fulfilled", refunded)).toBe(true);
    expect(canApplyTransition("pending", refunded)).toBe(false);
    expect(canApplyTransition("failed", refunded)).toBe(false);
    expect(canApplyTransition("refunded", refunded)).toBe(false);
  });
});
