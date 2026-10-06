import { cookies } from "next/headers";

import { createShopServiceClient, CART_COOKIE } from "@/lib/shop/db";

/**
 * GET /api/orders/[id]/status — pollable order status for the confirmation
 * page. Scoped to the caller's guest token: an order is only visible when
 * its `guest_token` matches the cart cookie (mirrors the
 * `guest_own_order_read` RLS policy).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const svc = createShopServiceClient();
  const { data } = await svc
    .from("orders")
    .select("order_number, status, payment_status, total")
    .eq("id", id)
    .eq("guest_token", token)
    .maybeSingle();

  if (!data) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json(data);
}
