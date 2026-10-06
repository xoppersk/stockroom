import Stripe from "stripe";

/**
 * Stripe SDK accessor. All Stripe keys are optional — when they are absent
 * (or still the `.env.example` placeholders) the storefront runs in demo
 * mode and `getStripe()` returns null. Never invent credentials: keys come
 * only from the environment.
 */

const PLACEHOLDER_MARKER = "REPLACE_ME";

function cleanEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim() === "" || value.includes(PLACEHOLDER_MARKER)) {
    return null;
  }
  return value;
}

let cachedClient: Stripe | null | undefined;

/** Stripe SDK client, or null when `STRIPE_SECRET_KEY` is not configured. */
export function getStripe(): Stripe | null {
  const key = cleanEnv("STRIPE_SECRET_KEY");
  if (!key) return null;
  if (cachedClient === undefined) {
    cachedClient = new Stripe(key);
  }
  return cachedClient;
}

/** Webhook signing secret, or null when not configured. */
export function getWebhookSecret(): string | null {
  return cleanEnv("STRIPE_WEBHOOK_SECRET");
}

/** True when a real Stripe Checkout flow is possible. */
export function isStripeConfigured(): boolean {
  return getStripe() !== null && getWebhookSecret() !== null;
}

/** Base URL of the app, used to build Stripe redirect URLs. */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
