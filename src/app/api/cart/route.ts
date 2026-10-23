import { NextResponse } from "next/server";

import { getCartView, getOrCreateCart, buildCartView } from "@/lib/shop/cart";
import { ShopServiceUnavailableError, requireShopServiceClient } from "@/lib/shop/db";

/**
 * GET /api/cart — the caller's cart (guest via HttpOnly token cookie, or
 * the signed-in user's open cart). Never creates a cart; an absent cart
 * reads as an empty cart so the storefront badge/drawer can render.
 *
 * POST /api/cart — ensure a cart exists (creates the carts row, sets the
 * httpOnly `stockroom_cart` guest_token cookie; attaches user_id when the
 * caller is signed in) and return it.
 */

export async function GET() {
  const view = await getCartView();
  if (!view) {
    return NextResponse.json({
      cart: null,
      lines: [],
      itemCount: 0,
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      serviceConfigured: false,
    });
  }
  return NextResponse.json({ cart: view, lines: view.lines, serviceConfigured: true });
}

export async function POST() {
  try {
    const cart = await getOrCreateCart();
    const svc = requireShopServiceClient("POST /api/cart");
    const view = await buildCartView(svc, cart);
    return NextResponse.json({ cart: view, lines: view.lines }, { status: 201 });
  } catch (e) {
    if (e instanceof ShopServiceUnavailableError) {
      return NextResponse.json(
        {
          error:
            "Cart service is not configured in this environment (SUPABASE_SERVICE_ROLE_KEY missing). It is set in production; no cart was created here.",
        },
        { status: 500 },
      );
    }
    console.error("[api/cart] POST failed:", e);
    return NextResponse.json({ error: "Could not start a cart. Please try again." }, { status: 500 });
  }
}
