import type Stripe from "stripe";

import { createShopServiceClient, type Json } from "@/lib/shop/db";
import { getStripe, getWebhookSecret } from "@/lib/stripe/client";
import { verifyStripeSignature, WebhookSignatureError } from "@/lib/stripe/webhook";

/**
 * POST /api/webhooks/stripe — Stripe event receiver.
 *
 * 1. Read the RAW body (`req.text()` — body parsing stays disabled) and
 *    verify the signature with `STRIPE_WEBHOOK_SECRET` BEFORE any DB work.
 *    Bad signature → 400, no writes.
 * 2. Hand the verified event to `handle_stripe_event` (SECURITY DEFINER),
 *    which inserts into `webhook_events` with ON CONFLICT → skipped_duplicate
 *    and dispatches with forward-only guarded transitions. Duplicates and
 *    out-of-order deliveries converge without regressing the order.
 * 3. Any processing error → 500 so Stripe retries; the UNIQUE
 *    constraint on `stripe_event_id` guarantees exactly-once effects.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = getWebhookSecret();

  if (!stripe || !webhookSecret) {
    // Server misconfiguration — 500 (not 400) so it shows up as an error,
    // never silently accepted.
    return new Response("Stripe webhooks are not configured.", { status: 500 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return new Response(err.message, { status: 400 });
    }
    throw err;
  }

  try {
    const svc = createShopServiceClient();
    const { error } = await svc.rpc("handle_stripe_event", {
      p_event: event as unknown as Json,
    });
    if (error) throw error;
  } catch (err) {
    // Never log the raw body or signature — the event id is enough to trace.
    console.error(
      "[stripe-webhook] processing failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return new Response("Webhook processing failed.", { status: 500 });
  }

  return Response.json({ received: true });
}
