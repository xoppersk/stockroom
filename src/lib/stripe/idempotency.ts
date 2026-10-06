/**
 * Webhook idempotency contract (pure helper; enforcement lives in the DB).
 *
 * `handle_stripe_event` (migration 00009) starts every run with
 * `INSERT INTO webhook_events ... ON CONFLICT (stripe_event_id) DO NOTHING`.
 * The UNIQUE constraint on `stripe_event_id` is what makes Stripe's
 * re-deliveries (retries, duplicate sends) exactly-once: a conflicting
 * insert becomes a `skipped_duplicate` no-op and the route returns 200 so
 * Stripe does NOT retry again (retries are reserved for 500s).
 */

export type WebhookProcessingStatus = "received" | "skipped_duplicate";

export interface WebhookDedupeResult {
  /** What the handler recorded for this delivery. */
  processingStatus: WebhookProcessingStatus;
  /** True when this delivery was a re-delivery (no state changed). */
  isDuplicate: boolean;
  /**
   * HTTP status the route returns. Duplicates answer 200 — Stripe retries
   * only on 5xx, so a duplicate must never surface as a 500.
   */
  httpStatus: 200;
}

/**
 * Resolve the outcome of the idempotency insert: `rowWasInserted` is true
 * when the INSERT returned a row (first delivery) and false when the
 * UNIQUE(stripe_event_id) conflict fired (re-delivery).
 */
export function resolveWebhookDedupe(rowWasInserted: boolean): WebhookDedupeResult {
  if (rowWasInserted) {
    return { processingStatus: "received", isDuplicate: false, httpStatus: 200 };
  }
  return { processingStatus: "skipped_duplicate", isDuplicate: true, httpStatus: 200 };
}
