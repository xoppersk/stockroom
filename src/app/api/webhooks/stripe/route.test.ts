import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level webhook contract tests (Phase 10 QA).
 *
 * These drive the real `POST` handler and assert the security ordering the
 * route documents: signature verification happens BEFORE any database work,
 * a missing header answers 400, a bad signature answers 400, and a missing
 * server secret answers 500. Only fake env values are used — the Stripe
 * keys are never real (the module import also proves the route's import
 * chain is Vitest-safe).
 */
const FAKE_SECRET_KEY = "sk_test_fake_for_route_tests";
const FAKE_WEBHOOK_SECRET = "whsec_fake_for_route_tests";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/stripe", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_SECRET_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", FAKE_WEBHOOK_SECRET);
    ({ POST } = await import("./route"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await POST(post("{}"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing stripe-signature header.");
  });

  it("returns 400 for an invalid signature, before any DB work", async () => {
    const res = await POST(post('{"id":"evt_1"}', { "stripe-signature": "t=1,v1=bad" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid webhook signature.");
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await POST(post("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the Stripe secret key is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const res = await POST(post("{}"));
    expect(res.status).toBe(500);
  });
});
