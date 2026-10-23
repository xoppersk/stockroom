import {
  createShopServiceClient,
  createShopUserClient,
  getSessionUserId,
} from "./db";
import { getCartToken } from "./cart";
import type { ShopOrder, ShopOrderItem } from "./types";

/**
 * Order reads.
 *
 * Two legitimate read paths, matching the RLS contract:
 * 1. Signed-in owner — the SSR user client, filtered by RLS. Post-00011
 *    the `orders_customer_read` policy (orders) / `order_items_customer_read`
 *    (items) expose rows where `created_by = auth.uid()`. We query as the
 *    user with NO service role and NO superset filtering: RLS returns only
 *    the customer's own orders. Pre-00011 (not yet applied live) the same
 *    query honestly returns nothing — staff/guest policies don't match a
 *    plain customer — which the UI renders as an empty history.
 * 2. Guest — orders carry the cart's `guest_token`; the RLS guest policy
 *    compares it to `guest_cart_token()` (the `app.guest_token` setting),
 *    which app code cannot set per request (no setter RPC in the
 *    migrations). As v1 did for carts, the guest read therefore goes
 *    through the service client with application-enforced scoping:
 *    `.eq("id", orderId).eq("guest_token", cookieToken)` — a token
 *    mismatch returns the same "not found" as a missing order (no oracle).
 */

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  discountCode: string | null;
  trackingNumber: string | null;
  createdAt: string;
  isGuestOrder: boolean;
  items: {
    id: string;
    productTitle: string;
    variantTitle: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

const cents = (numeric: string | number) => Math.round(Number(numeric) * 100);

function toView(order: ShopOrder, items: ShopOrderItem[]): OrderView {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    currency: order.currency,
    subtotalCents: cents(order.subtotal),
    discountCents: cents(order.discount_total),
    taxCents: cents(order.tax_total),
    shippingCents: cents(order.shipping_total),
    totalCents: cents(order.total),
    discountCode: order.discount_code,
    trackingNumber: order.tracking_number,
    createdAt: order.created_at,
    isGuestOrder: !!order.guest_token,
    items: (items ?? []).map((i) => ({
      id: i.id,
      productTitle: i.product_title,
      variantTitle: i.variant_title,
      sku: i.sku,
      quantity: i.quantity,
      unitPriceCents: cents(i.unit_price),
      lineTotalCents: cents(i.line_total),
    })),
  };
}

const ORDER_COLS =
  "id, order_number, customer_id, status, payment_status, subtotal, discount_total, tax_total, shipping_total, total, refunded_total, currency, discount_code, shipping_address, tracking_number, source, external_id, guest_token, stripe_checkout_session_id, created_by, created_at, updated_at";
const ITEM_COLS = "id, order_id, variant_id, product_title, variant_title, sku, quantity, unit_price, line_total";

/** The signed-in customer's own orders (RLS-filtered). [] when signed out. */
export async function getMyOrders(): Promise<{ signedIn: boolean; orders: OrderView[] }> {
  const client = await createShopUserClient();
  const userId = await getSessionUserId(client);
  if (!userId) return { signedIn: false, orders: [] };
  const { data: orders, error } = await client
    .from("orders")
    .select(ORDER_COLS)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[shop] my-orders read failed:", error.message);
    return { signedIn: true, orders: [] };
  }
  const rows = (orders ?? []) as ShopOrder[];
  if (rows.length === 0) return { signedIn: true, orders: [] };
  const { data: items } = await client
    .from("order_items")
    .select(ITEM_COLS)
    .in("order_id", rows.map((o) => o.id));
  const byOrder = new Map<string, ShopOrderItem[]>();
  for (const item of (items ?? []) as ShopOrderItem[]) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }
  return { signedIn: true, orders: rows.map((o) => toView(o, byOrder.get(o.id) ?? [])) };
}

/**
 * One order for /order/[id]: owner path first (signed-in, RLS), then the
 * guest-token path (service client, token-scoped). UUID ids only —
 * order_number lookups ("ORD-1053") resolve through the same two paths.
 */
export async function getOrderForViewer(idOrNumber: string): Promise<OrderView | null> {
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idOrNumber);

  // Path 1: signed-in owner / staff via RLS on the user client.
  try {
    const client = await createShopUserClient();
    const userId = await getSessionUserId(client);
    if (userId) {
      const query = client.from("orders").select(ORDER_COLS);
      const { data: order } = await (isUuid ? query.eq("id", idOrNumber) : query.eq("order_number", idOrNumber.toUpperCase()))
        .maybeSingle();
      if (order) {
        const { data: items } = await client
          .from("order_items")
          .select(ITEM_COLS)
          .eq("order_id", (order as ShopOrder).id);
        return toView(order as ShopOrder, (items ?? []) as ShopOrderItem[]);
      }
    }
  } catch {
    // fall through to the guest path
  }

  // Path 2: guest via the HttpOnly cart-token cookie (service client,
  // application-scoped — see the module comment).
  const token = await getCartToken();
  const svc = createShopServiceClient();
  if (!token || !svc) return null;
  const query = svc.from("orders").select(ORDER_COLS).eq("guest_token", token);
  const { data: order } = await (isUuid ? query.eq("id", idOrNumber) : query.eq("order_number", idOrNumber.toUpperCase()))
    .maybeSingle();
  if (!order) return null;
  const { data: items } = await svc
    .from("order_items")
    .select(ITEM_COLS)
    .eq("order_id", (order as ShopOrder).id);
  return toView(order as ShopOrder, (items ?? []) as ShopOrderItem[]);
}
