import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_QTY, removeCartItem, setCartItemQty } from "@/lib/shop/cart";

/**
 * PATCH /api/cart/items/[itemId] — set a line's quantity (0 removes it).
 * DELETE /api/cart/items/[itemId] — remove the line.
 * Ownership is verified server-side against the caller's cart
 * (guest token cookie or signed-in user) before any write.
 */

const qtySchema = z.object({ quantity: z.number().int().min(0).max(MAX_QTY) });

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ error: "Item not found in your cart." }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = qtySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
  }
  const result = await setCartItemQty(itemId, parsed.data.quantity);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ cart: result.view, lines: result.view.lines });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ error: "Item not found in your cart." }, { status: 404 });
  }
  const result = await removeCartItem(itemId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ cart: result.view, lines: result.view.lines });
}
