import { cookies } from "next/headers";

import { createShopServiceClient, CART_COOKIE } from "@/lib/shop/db";
import { appBaseUrl, getStripe } from "@/lib/stripe/client";

/**
 * POST /api/checkout — start checkout for the caller's cart.
 *
 * The client never dictates the amount: `create_checkout_session` (SECURITY
 * DEFINER) locks the cart, re-computes totals from live variant prices, and
 * re-validates the stored discount code server-side. It returns the order id.
 *
 * - Stripe configured → create a real Checkout Session from the DB-computed
 *   order lines and return `{ url }`.
 * - Otherwise (demo mode) → return `{ demoOrderId }`; the success page
 *   simulates payment confirmation through the real webhook state machine.
 */
export async function POST() {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) {
    return Response.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const svc = createShopServiceClient();

  const { data: cart } = await svc
    .from("carts")
    .select("id, expires_at")
    .eq("guest_token", token)
    .maybeSingle();
  if (!cart || new Date(cart.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const { data: orderId, error: rpcError } = await svc.rpc("create_checkout_session", {
    p_cart_id: cart.id,
    p_guest_token: token,
  });
  if (rpcError || !orderId) {
    return Response.json(
      { error: rpcError?.message ?? "Checkout failed. Please try again." },
      { status: 400 },
    );
  }

  const [{ data: order }, { data: items }] = await Promise.all([
    svc
      .from("orders")
      .select("id, order_number, total, guest_token")
      .eq("id", orderId)
      .single(),
    svc
      .from("order_items")
      .select("product_title, variant_title, quantity, unit_price")
      .eq("order_id", orderId)
      .order("product_title", { ascending: true }),
  ]);
  if (!order) {
    return Response.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }

  const stripe = getStripe();
  if (!stripe) {
    // Demo mode — no Stripe keys configured.
    return Response.json({ demoOrderId: order.id, orderNumber: order.order_number });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: (items ?? []).map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(item.unit_price) * 100),
        product_data: {
          name: `${item.product_title} — ${item.variant_title}`,
        },
      },
    })),
    metadata: { order_id: order.id, order_number: order.order_number },
    success_url: `${appBaseUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl()}/cart`,
  });

  if (!session.url) {
    return Response.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }

  // Record the session id so checkout.session.completed can find the order
  // even if metadata were ever stripped.
  await svc.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);

  return Response.json({ url: session.url });
}
