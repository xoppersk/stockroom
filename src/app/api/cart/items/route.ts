import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_QTY, addCartItem } from "@/lib/shop/cart";

/**
 * POST /api/cart/items — add a variant to the caller's cart.
 * Body: { variantId: uuid, quantity?: 1..99 }. Creates the cart first when
 * the caller has none. Stock is enforced against inventory_levels.
 */

const schema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QTY).optional().default(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That item could not be added." }, { status: 400 });
  }
  const result = await addCartItem(parsed.data.variantId, parsed.data.quantity);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ cart: result.view, lines: result.view.lines }, { status: 201 });
}
