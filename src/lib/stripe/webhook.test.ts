import { describe, expect, it } from "vitest";
import Stripe from "stripe";

import { verifyStripeSignature, WebhookSignatureError } from "./webhook";

/**
 * Webhook signature verification tests (Phase 10 QA).
 *
 * Signatures are generated with the real Stripe SDK's
 * `generateTestHeaderString` — pure HMAC, no network — so these tests prove
 * the exact verification path the route uses, with fakes only (never real
 * credentials).
 */

const WEBHOOK_SECRET = "whsec_test_fake_secret_for_unit_tests";

const RAW_BODY = JSON.stringify({
  id: "evt_test_123",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test_123" } },
});

function signedHeader(payload: string, secret: string = WEBHOOK_SECRET): string {
  return new Stripe(secret).webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

describe("verifyStripeSignature", () => {
  it("accepts a valid signature and returns the parsed event", () => {
    const event = verifyStripeSignature(RAW_BODY, signedHeader(RAW_BODY), WEBHOOK_SECRET);
    expect(event.id).toBe("evt_test_123");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("rejects a tampered body (signature computed over different bytes)", () => {
    const tampered = RAW_BODY.replace("pi_test_123", "pi_test_999");
    expect(() => verifyStripeSignature(tampered, signedHeader(RAW_BODY), WEBHOOK_SECRET)).toThrow(
      WebhookSignatureError,
    );
    expect(() => verifyStripeSignature(tampered, signedHeader(RAW_BODY), WEBHOOK_SECRET)).toThrow(
      "Invalid webhook signature.",
    );
  });

  it("rejects a signature made with the wrong secret", () => {
    const header = signedHeader(RAW_BODY, "whsec_wrong_secret");
    expect(() => verifyStripeSignature(RAW_BODY, header, WEBHOOK_SECRET)).toThrow(
      "Invalid webhook signature.",
    );
  });

  it("rejects a garbage signature header", () => {
    expect(() => verifyStripeSignature(RAW_BODY, "t=123,v1=deadbeef", WEBHOOK_SECRET)).toThrow(
      WebhookSignatureError,
    );
  });

  it("rejects a missing signature header (the route answers 400, no DB writes)", () => {
    expect(() => verifyStripeSignature(RAW_BODY, null, WEBHOOK_SECRET)).toThrow(
      "Missing stripe-signature header.",
    );
  });

  it("rejects an empty secret (server misconfiguration surfaces as an error)", () => {
    expect(() => verifyStripeSignature(RAW_BODY, signedHeader(RAW_BODY), "")).toThrow(
      WebhookSignatureError,
    );
  });

  it("rejects a header replayed from a different payload (Stripe's timestamp tolerance applies in the real SDK)", () => {
    // generateTestHeaderString signs the payload; reusing the header for a
    // different payload must fail — this is the replay/tamper property the
    // route depends on before touching the database.
    const header = signedHeader(RAW_BODY);
    const otherBody = JSON.stringify({ id: "evt_test_456", type: "charge.refunded" });
    expect(() => verifyStripeSignature(otherBody, header, WEBHOOK_SECRET)).toThrow(
      WebhookSignatureError,
    );
  });
});
