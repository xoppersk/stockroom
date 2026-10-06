"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { CART_COOKIE, createShopServiceClient, type Json } from "@/lib/shop/db";

/**
 * Demo-mode payment adapter. When no Stripe keys are configured, checkout
 * still runs end-to-end against the real database: the order is created by
 * `create_checkout_session`, and this adapter simulates the
 * `checkout.session.completed` webhook by feeding a synthetic event through
 * the real `handle_stripe_event` state machine (payment succeeded → order
 * paid → stock decremented → notification → guest token rotated).
 *
 * Idempotency comes free: the synthetic event id is derived from the order
 * id, so a double invocation (e.g. React StrictMode) hits the
 * `webhook_events` UNIQUE constraint and becomes a `skipped_duplicate`
 * no-op.
 */

const orderIdSchema = z.string().uuid();

export interface DemoResult {
  ok: boolean;
  message: string;
}

/**
 * Simulate payment confirmation for a demo-mode order. Only the guest who
 * owns the order (cookie token match) and only while it is still `pending`.
 */
export async function confirmDemoPayment(orderId: string): Promise<DemoResult> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { ok: false, message: "Order not found." };
  }

  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) {
    return { ok: false, message: "Your session expired. Start checkout again." };
  }

  const svc = createShopServiceClient();
  const { data: order } = await svc
    .from("orders")
    .select("id, order_number, status, total, guest_token")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!order || order.guest_token !== token) {
    return { ok: false, message: "Order not found." };
  }
  if (order.status !== "pending") {
    return { ok: true, message: "Payment already confirmed." };
  }

  const stamp = order.id.replace(/-/g, "").slice(0, 24);
  const event: Json = {
    id: `evt_demo_${stamp}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_demo_${stamp}`,
        payment_intent: `pi_demo_${stamp}`,
        amount_total: Math.round(Number(order.total) * 100),
        currency: "usd",
        metadata: { order_id: order.id },
      },
    },
  };

  const { error } = await svc.rpc("handle_stripe_event", { p_event: event });
  if (error) {
    return { ok: false, message: "Demo payment failed. Please try again." };
  }
  return { ok: true, message: "Payment confirmed." };
}
