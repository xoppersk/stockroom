import Stripe from "stripe";

/**
 * Stripe webhook signature verification (extracted from
 * `src/app/api/webhooks/stripe/route.ts` so the logic is unit-testable).
 *
 * The route MUST read the raw request body (`req.text()`, never parsed JSON)
 * and verify the `stripe-signature` HMAC against `STRIPE_WEBHOOK_SECRET`
 * before doing any database work. Verification needs only the signing
 * secret — no Stripe API key — so this helper builds its own SDK instance
 * from the secret and stays independent of `getStripe()`.
 */
export class WebhookSignatureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verify the raw-body signature of an inbound Stripe event.
 *
 * @returns the parsed `Stripe.Event` when the signature is valid.
 * @throws {WebhookSignatureError} when the signature header is missing or
 *   the signature does not match the payload (bad signature → the route
 *   answers 400 and performs zero database writes).
 */
export function verifyStripeSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) {
    throw new WebhookSignatureError("Missing stripe-signature header.");
  }
  if (!secret) {
    throw new WebhookSignatureError("Stripe webhook secret is not configured.");
  }
  try {
    return new Stripe(secret).webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new WebhookSignatureError("Invalid webhook signature.", { cause: err });
  }
}
