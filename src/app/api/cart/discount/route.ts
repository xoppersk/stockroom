import { NextResponse } from "next/server";
import { z } from "zod";

import { applyDiscountCode, removeDiscountCode } from "@/lib/shop/cart";

/**
 * POST /api/cart/discount — validate a code live via
 * `apply_discount_validation` and store it on the cart (re-validated
 * server-side again inside create_checkout_session).
 * DELETE /api/cart/discount — remove the stored code.
 */

const schema = z.object({ code: z.string().trim().min(1).max(32) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a discount code." }, { status: 400 });
  const result = await applyDiscountCode(parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ cart: result.view, lines: result.view.lines });
}

export async function DELETE() {
  const result = await removeDiscountCode();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ cart: result.view, lines: result.view.lines });
}
