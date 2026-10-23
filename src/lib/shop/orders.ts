import { CART_COOKIE, requireShopServiceClient } from "./db";
import { ensureGuestToken, getActiveCart } from "./catalog";
import { mapOrderRow } from "./view";
import { productImageUrl } from "./db";
import type { CheckoutResult, Order } from "./types";
import { cookies } from "next/headers";

/**
 * Checkout + order creation (adapted from v1 `src/lib/shop/orders.ts`).
 *
 * The ONLY writer in the shop layer. Everything goes through the
 * `checkout_create_order` SECURITY DEFINER RPC (00011_production) so an
 * order is never created without its inventory reservation and ledger
 * postings succeeding in the same transaction. Direct table writes from
 * the app are not used for checkout.
 *
 * Guest identity: the HttpOnly `stockroom_cart` cookie (CART_COOKIE).
 * Signed-in customers attach their user id as well; the RPC links the
 * order to the account when a user id is present.
 */

export interface CheckoutInput {
  email: string;
  shippingName: string;
  address1: string;
  address2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
  discountCode?: string;
  userId?: string | null;
  paymentReference?: string;
}

export interface RpcCheckoutLine {
  variant_id: string;
  qty: number;
  unit_price: number;
}

function badInput(message: string): Error {
  const err = new Error(message);
  err.name = "CheckoutInputError";
  return err;
}

/**
 * Run checkout for the active cart. Returns the created order summary.
 * Throws CheckoutInputError on invalid input, or the RPC/database error
 * otherwise. On success the cart cookie is cleared (the RPC marks the
 * cart converted; the cookie token is rotated so a stale token can never
 * be reused).
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badInput("Enter a valid email address.");
  }
  for (const [label, value] of [
    ["Full name", input.shippingName],
    ["Address", input.address1],
    ["City", input.city],
    ["Postal code", input.postalCode],
    ["Country", input.country],
  ] as const) {
    if (!value.trim()) throw badInput(`${label} is required.`);
  }

  const svc = requireShopServiceClient("checkout");
  const cart = await getActiveCart();
  if (!cart || cart.items.length === 0) {
    throw badInput("Your cart is empty.");
  }

  const lines: RpcCheckoutLine[] = cart.items.map((i) => ({
    variant_id: i.variantId,
    qty: i.qty,
    unit_price: i.unitPrice,
  }));

  const guestToken = await ensureGuestToken();

  const { data, error } = await svc.rpc("checkout_create_order", {
    p_guest_token: guestToken,
    p_user_id: input.userId ?? null,
    p_email: email,
    p_shipping_name: input.shippingName.trim(),
    p_address1: input.address1.trim(),
    p_address2: input.address2?.trim() || null,
    p_city: input.city.trim(),
    p_region: input.region?.trim() || null,
    p_postal_code: input.postalCode.trim(),
    p_country: input.country.trim(),
    p_phone: input.phone?.trim() || null,
    p_discount_code: input.discountCode?.trim().toUpperCase() || null,
    p_lines: lines as unknown as string,
    p_payment_reference: input.paymentReference ?? null,
  });

  if (error) {
    // Surface inventory-shortage failures as input errors (v1 behaviour).
    if (/insufficient stock|inventory/i.test(error.message)) {
      throw badInput(
        "Some items in your cart are no longer available in the requested quantity. " +
          "Please review your cart and try again.",
      );
    }
    throw new Error(`Checkout failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id) throw new Error("Checkout failed: no order was created.");

  // Rotate the guest token so the used token can never be replayed.
  const cookieStore = await cookies();
  cookieStore.delete(CART_COOKIE);

  return {
    orderId: row.order_id as string,
    orderNumber: row.order_number as string,
    total: Number(row.total ?? 0),
  };
}

/** Fetch a single order with items (receipt page). */
export async function getOrderWithItems(orderId: string): Promise<Order | null> {
  const svc = requireShopServiceClient("getOrderWithItems");
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(CART_COOKIE)?.value ?? null;

  // Prefer the user's own order; fall back to the (rotated) guest token
  // the receipt page receives right after checkout via the order id.
  const { data, error } = await svc
    .from("orders")
    .select("*,items:order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Order query failed: ${error.message}`);
  if (!data) return null;
  if (guestToken && data.guest_token && data.guest_token !== guestToken) {
    return null;
  }
  return mapOrderRow(
    data as Parameters<typeof mapOrderRow>[0],
    productImageUrl,
  );
}
