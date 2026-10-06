import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCartToken } from "@/lib/cart/cart";
import { createShopServiceClient } from "@/lib/shop/db";
import {
  SuccessClient,
  type SuccessOrder,
  type SuccessOrderItem,
} from "./success-client";

export const metadata: Metadata = { title: "Order confirmed" };

interface SearchParams {
  /** Demo mode: the order id returned by /api/checkout. */
  order?: string;
  /** Real Stripe mode: the Checkout Session id from success_url. */
  session_id?: string;
}

/**
 * Order confirmation. The order is only readable when the caller's cart
 * cookie token matches the order's guest_token — the same ownership rule as
 * the `guest_own_order_read` RLS policy, enforced here because the page runs
 * on the service-role client.
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const token = await getCartToken();
  if (!token) notFound();

  const svc = createShopServiceClient();
  const orderQuery = svc
    .from("orders")
    .select(
      "id, order_number, status, subtotal, discount_total, discount_code, total, guest_token",
    )
    .eq("guest_token", token);

  const { data: order } = sp.order
    ? await orderQuery.eq("id", sp.order).maybeSingle()
    : sp.session_id
      ? await orderQuery.eq("stripe_checkout_session_id", sp.session_id).maybeSingle()
      : { data: null };

  if (!order) notFound();

  const { data: items } = await svc
    .from("order_items")
    .select("product_title, variant_title, sku, quantity, unit_price, line_total")
    .eq("order_id", order.id)
    .order("product_title", { ascending: true });

  const successOrder: SuccessOrder = {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    subtotal: order.subtotal,
    discountTotal: order.discount_total,
    discountCode: order.discount_code,
    total: order.total,
  };
  const successItems: SuccessOrderItem[] = (items ?? []).map((i) => ({
    productTitle: i.product_title,
    variantTitle: i.variant_title,
    sku: i.sku,
    quantity: i.quantity,
    unitPrice: i.unit_price,
    lineTotal: i.line_total,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <SuccessClient order={successOrder} items={successItems} isDemo={Boolean(sp.order)} />
    </div>
  );
}
