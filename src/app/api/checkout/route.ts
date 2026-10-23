import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { cartCookieOptions, findCart } from "@/lib/shop/cart";
import {
  CART_COOKIE,
  ShopServiceUnavailableError,
  createShopUserClient,
  getSessionUserId,
  requireShopServiceClient,
  type ShopClient,
} from "@/lib/shop/db";

/**
 * POST /api/checkout — start checkout for the caller's cart.
 *
 * Adapted from v1's route, minus Stripe: there are NO Stripe keys
 * configured for this project (gap 4), so there is no Checkout Session
 * and no demo mode. `create_checkout_session` (SECURITY DEFINER) locks
 * the cart, re-computes totals from live variant prices, re-validates
 * the discount, checks stock, and creates the PENDING order + PENDING
 * payments row server-side — the client never dictates amounts. The
 * response carries the order id; the order page states plainly that
 * online payment isn't enabled yet and the order is recorded as pending.
 *
 * Guest-token RLS: the RPC takes the token as a parameter and checks it
 * against the cart row itself (v1's mechanism — cart resolution above
 * runs over the service client, token-scoped).
 *
 * created_by (migration 00011): the re-created create_checkout_session
 * stamps `created_by = auth.uid()` — the RPC CALLER's uid. So:
 * - signed-in shopper → the RPC is called through the USER-SESSION
 *   client, making created_by the customer (their /account/orders RLS
 *   read then finds it). A service-role call would stamp NULL.
 * - guest → service client; created_by stays NULL and the order is
 *   read back via its guest_token.
 */
export async function POST() {
  try {
    const svc = requireShopServiceClient("POST /api/checkout");
    const cart = await findCart(svc);
    if (!cart) {
      return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    }
    if (new Date(cart.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This cart has expired. Please start again." }, { status: 400 });
    }

    const userClient = await createShopUserClient();
    const userId = await getSessionUserId(userClient);
    const rpcClient: ShopClient = userId ? userClient : svc;
    const { data: orderId, error: rpcError } = await rpcClient.rpc("create_checkout_session", {
      p_cart_id: cart.id,
      p_guest_token: cart.guest_token,
    });
    if (rpcError || !orderId) {
      return NextResponse.json(
        { error: rpcError?.message ?? "Checkout failed. Please try again." },
        { status: 400 },
      );
    }

    const { data: order } = await svc
      .from("orders")
      .select("id, order_number, total, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    // Keep the guest cookie aligned with the cart that produced the order
    // (the order's guest_token IS the cart token, so /order/[id] can read
    // it back for guests). Refresh its lifetime.
    const store = await cookies();
    store.set(CART_COOKIE, cart.guest_token, cartCookieOptions());

    return NextResponse.json({
      orderId,
      orderNumber: order?.order_number ?? null,
      totalCents: order ? Math.round(Number(order.total) * 100) : null,
      paymentStatus: order?.payment_status ?? "pending",
      paymentEnabled: false,
    });
  } catch (e) {
    if (e instanceof ShopServiceUnavailableError) {
      return NextResponse.json(
        {
          error:
            "Checkout is not configured in this environment (SUPABASE_SERVICE_ROLE_KEY missing). It is set in production; no order was created here.",
        },
        { status: 500 },
      );
    }
    console.error("[api/checkout] POST failed:", e);
    return NextResponse.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }
}
