import { describe, expect, it } from "vitest";

import { resolveWebhookDedupe } from "./idempotency";

/**
 * Webhook retry / idempotency tests (Phase 10 QA).
 *
 * Enforcement is the UNIQUE(stripe_event_id) constraint on `webhook_events`
 * (migration 00009): the handler's INSERT ... ON CONFLICT DO NOTHING turns
 * every Stripe re-delivery into a `skipped_duplicate` no-op. This test pins
 * the contract that the row-insert outcome maps to.
 */
describe("resolveWebhookDedupe", () => {
  it("marks a first delivery as received", () => {
    expect(resolveWebhookDedupe(true)).toEqual({
      processingStatus: "received",
      isDuplicate: false,
      httpStatus: 200,
    });
  });

  it("marks a re-delivery (UNIQUE conflict) as skipped_duplicate", () => {
    expect(resolveWebhookDedupe(false)).toEqual({
      processingStatus: "skipped_duplicate",
      isDuplicate: true,
      httpStatus: 200,
    });
  });

  it("answers duplicates with 200, never 500 — Stripe retries only on 5xx", () => {
    const first = resolveWebhookDedupe(true);
    const retry = resolveWebhookDedupe(false);
    const retryAgain = resolveWebhookDedupe(false);
    // Every delivery is acknowledged; only genuine processing failures 500.
    for (const outcome of [first, retry, retryAgain]) {
      expect(outcome.httpStatus).toBe(200);
    }
    // Repeated re-deliveries stay duplicates — effects are exactly-once.
    expect(retry.isDuplicate).toBe(true);
    expect(retryAgain.isDuplicate).toBe(true);
  });
});
