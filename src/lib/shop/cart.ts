import { cookies } from "next/headers";

import {
  CART_COOKIE,
  ShopServiceUnavailableError,
  createShopServiceClient,
  createShopUserClient,
  getSessionUserId,
  productImageUrl,
  requireShopServiceClient,
  type ShopClient,
} from "./db";
import type { ShopCart } from "./types";

/**
 * Cart persistence — carts / cart_items (migration 00009).
 *
 * Mechanism (copied from v1 `src/lib/cart/cart.ts`): the guest identity for
 * cart RLS is `guest_cart_token()`, which reads the Postgres setting
 * `app.guest_token`. No migration provides a per-request setter for that
 * setting from app code, so — exactly as v1 did — cart operations run
 * through the SERVICE-ROLE client and enforce ownership in application
 * code: every query is scoped by the HttpOnly cookie token
 * (`.eq("guest_token", token)`) and, for signed-in shoppers, by user_id.
 * The RLS owner policies remain as defense in depth for any anon-path read.
 *
 * Signed-in flow: carts carry `user_id`. Resolution order in
 * `resolveCart()` is (1) the user's existing open cart (found by user_id —
 * this is what makes the cart survive sign-out/sign-in: on the next
 * sign-in the same row is re-attached and the cookie re-issued), then
 * (2) the cookie-token cart (claimed by setting user_id), then
 * (3) a fresh cart. Guest carts are never merged across users.
 */

const CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const MAX_QTY = 99;

export function cartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_MAX_AGE_SECONDS,
  };
}

export async function getCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

async function setCartToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, cartCookieOptions());
}

function isLive(cart: Pick<ShopCart, "expires_at">): boolean {
  return new Date(cart.expires_at).getTime() > Date.now();
}

/* ------------------------------------------------------------------ */
/* View model                                                          */
/* ------------------------------------------------------------------ */

export interface CartLineView {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  imageUrl: string | null;
  /** Units on hand; null when stock is not readable (no service key). */
  available: number | null;
}

export interface CartView {
  cartId: string;
  guestToken: string;
  userId: string | null;
  discountCode: string | null;
  lines: CartLineView[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export const EMPTY_CART_VIEW: Omit<CartView, "cartId" | "guestToken"> = {
  userId: null,
  discountCode: null,
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
};

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * Find the caller's cart WITHOUT creating one (read paths).
 * Returns null when there is no live cart. When the caller is signed in,
 * their user cart wins and the cookie is re-synced to it.
 */
export async function findCart(svc?: ShopClient): Promise<ShopCart | null> {
  const service = svc ?? createShopServiceClient();
  if (!service) return null;
  const userId = await getSessionUserId().catch(() => null);
  const token = await getCartToken();

  if (userId) {
    const { data: byUser } = await service
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5);
    const liveUserCart = (byUser ?? []).find(isLive);
    if (liveUserCart) {
      if (token !== liveUserCart.guest_token) {
        // Re-attach: same user → same open cart across sessions/devices.
        await setCartToken(liveUserCart.guest_token).catch(() => undefined);
      }
      return liveUserCart;
    }
  }

  if (token) {
    const { data } = await service
      .from("carts")
      .select("*")
      .eq("guest_token", token)
      .maybeSingle();
    if (data && isLive(data)) {
      if (userId && !data.user_id) {
        // Claim the guest cart for the now-signed-in shopper.
        const { data: claimed } = await service
          .from("carts")
          .update({ user_id: userId })
          .eq("id", data.id)
          .eq("guest_token", token)
          .select("*")
          .maybeSingle();
        return claimed ?? { ...data, user_id: userId };
      }
      if (userId && data.user_id && data.user_id !== userId) return null; // someone else's cart
      return data;
    }
  }
  return null;
}

/**
 * Find or create the caller's cart (write paths). Throws
 * ShopServiceUnavailableError when the service key is absent — callers
 * surface that as an honest 500, never a fixture fallback.
 */
export async function getOrCreateCart(): Promise<ShopCart> {
  const svc = requireShopServiceClient("cart write");
  const existing = await findCart(svc);
  if (existing) return existing;

  const userId = await getSessionUserId().catch(() => null);
  const { data, error } = await svc
    .from("carts")
    .insert(userId ? { user_id: userId } : {})
    .select("*")
    .single();
  if (error || !data) {
    console.error("[shop] cart create failed:", error?.message);
    throw new Error("Could not start a cart. Please try again.");
  }
  await setCartToken(data.guest_token);
  return data;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Full cart for rendering: lines with live variant prices + images. */
export async function getCartView(): Promise<CartView | null> {
  const svc = createShopServiceClient();
  if (!svc) return null; // cart unreadable in this env — UI shows the honest state
  const cart = await findCart(svc);
  if (!cart) return null;
  return buildCartView(svc, cart);
}

export async function buildCartView(svc: ShopClient, cart: ShopCart): Promise<CartView> {
  const { data: items } = await svc
    .from("cart_items")
    .select("id, variant_id, quantity")
    .eq("cart_id", cart.id)
    .order("added_at", { ascending: true });
  const rows = items ?? [];
  if (rows.length === 0) {
    return { cartId: cart.id, guestToken: cart.guest_token, ...EMPTY_CART_VIEW, userId: cart.user_id, discountCode: cart.discount_code };
  }

  const variantIds = rows.map((r) => r.variant_id);
  const [{ data: variants }, { data: inventory }] = await Promise.all([
    svc.from("product_variants").select("id, product_id, title, sku, price").in("id", variantIds),
    svc.from("inventory_levels").select("variant_id, quantity_on_hand").in("variant_id", variantIds),
  ]);
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const stockByVariant = new Map((inventory ?? []).map((i) => [i.variant_id, i.quantity_on_hand]));

  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
  const [{ data: products }, { data: images }] = await Promise.all([
    svc.from("products").select("id, title, slug").in("id", productIds),
    svc
      .from("product_images")
      .select("product_id, storage_path, position")
      .in("product_id", productIds)
      .order("position", { ascending: true }),
  ]);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const imageByProduct = new Map<string, string>();
  for (const img of images ?? []) {
    if (!imageByProduct.has(img.product_id)) imageByProduct.set(img.product_id, productImageUrl(img.storage_path));
  }

  const lines: CartLineView[] = [];
  for (const row of rows) {
    const variant = variantById.get(row.variant_id);
    const product = variant ? productById.get(variant.product_id) : undefined;
    if (!variant || !product) continue; // stale line (variant/product removed)
    const unit = Math.round(Number(variant.price) * 100);
    lines.push({
      itemId: row.id,
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      quantity: row.quantity,
      unitPriceCents: unit,
      lineTotalCents: unit * row.quantity,
      imageUrl: imageByProduct.get(product.id) ?? null,
      available: stockByVariant.get(variant.id) ?? 0,
    });
  }

  const subtotalCents = lines.reduce((n, l) => n + l.lineTotalCents, 0);

  // Discount: re-validated live (same as v1); the checkout RPC re-validates
  // again server-side, so this figure is display-only.
  let discountCents = 0;
  const code = cart.discount_code?.trim() ? cart.discount_code.trim() : null;
  if (code && subtotalCents > 0) {
    const { data: discount, error } = await svc.rpc("apply_discount_validation", {
      p_code: code,
      p_subtotal: subtotalCents / 100,
      p_customer_id: null,
    });
    if (!error && discount) {
      discountCents =
        discount.kind === "percentage"
          ? Math.round((subtotalCents * Number(discount.value)) / 100)
          : Math.min(Math.round(Number(discount.value) * 100), subtotalCents);
    }
  }

  return {
    cartId: cart.id,
    guestToken: cart.guest_token,
    userId: cart.user_id,
    discountCode: code,
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

/** Header badge count. 0 when the cart cannot be read in this env. */
export async function getCartCount(): Promise<number> {
  const view = await getCartView();
  return view?.itemCount ?? 0;
}

/* ------------------------------------------------------------------ */
/* Mutations (used by /api/cart route handlers)                        */
/* ------------------------------------------------------------------ */

export type CartActionResult =
  | { ok: true; view: CartView }
  | { ok: false; status: number; error: string };

function serviceError(e: unknown): CartActionResult {
  if (e instanceof ShopServiceUnavailableError) {
    return {
      ok: false,
      status: 500,
      error: "Cart service is not configured in this environment (SUPABASE_SERVICE_ROLE_KEY missing). It works in production; nothing was saved.",
    };
  }
  return { ok: false, status: 500, error: e instanceof Error ? e.message : "Cart update failed." };
}

export async function addCartItem(variantId: string, quantity: number): Promise<CartActionResult> {
  try {
    const svc = requireShopServiceClient("cart add");
    const { data: variant } = await svc
      .from("product_variants")
      .select("id, product_id")
      .eq("id", variantId)
      .maybeSingle();
    if (!variant) return { ok: false, status: 404, error: "That item is no longer available." };
    const { data: product } = await svc
      .from("products")
      .select("id, status")
      .eq("id", variant.product_id)
      .maybeSingle();
    if (!product || product.status !== "published") {
      return { ok: false, status: 404, error: "That product is no longer available." };
    }
    const { data: inv } = await svc
      .from("inventory_levels")
      .select("quantity_on_hand")
      .eq("variant_id", variant.id)
      .maybeSingle();
    const onHand = inv?.quantity_on_hand ?? 0;

    const cart = await getOrCreateCart();
    const { data: existing } = await svc
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cart.id)
      .eq("variant_id", variant.id)
      .maybeSingle();
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (nextQty > onHand) {
      return {
        ok: false,
        status: 409,
        error: onHand === 0 ? "Sorry — that item is out of stock." : `Only ${onHand} available.`,
      };
    }
    const write = existing
      ? await svc.from("cart_items").update({ quantity: nextQty }).eq("id", existing.id)
      : await svc.from("cart_items").insert({ cart_id: cart.id, variant_id: variant.id, quantity });
    if (write.error) return { ok: false, status: 500, error: "Could not update your cart." };
    return { ok: true, view: await buildCartView(svc, cart) };
  } catch (e) {
    return serviceError(e);
  }
}

/** Verify a cart line belongs to the caller's cart (token- or user-scoped). */
async function loadOwnLine(svc: ShopClient, itemId: string) {
  const cart = await findCart(svc);
  if (!cart) return null;
  const { data: item } = await svc
    .from("cart_items")
    .select("id, cart_id, variant_id, quantity")
    .eq("id", itemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  return item ? { cart, item } : null;
}

export async function setCartItemQty(itemId: string, quantity: number): Promise<CartActionResult> {
  try {
    const svc = requireShopServiceClient("cart set-qty");
    const own = await loadOwnLine(svc, itemId);
    if (!own) return { ok: false, status: 404, error: "Item not found in your cart." };
    if (quantity === 0) {
      const { error } = await svc.from("cart_items").delete().eq("id", own.item.id);
      if (error) return { ok: false, status: 500, error: "Could not remove the item." };
    } else {
      const { data: inv } = await svc
        .from("inventory_levels")
        .select("quantity_on_hand")
        .eq("variant_id", own.item.variant_id)
        .maybeSingle();
      const onHand = inv?.quantity_on_hand ?? 0;
      if (quantity > onHand) {
        return {
          ok: false,
          status: 409,
          error: onHand === 0 ? "Sorry — that item is out of stock." : `Only ${onHand} available.`,
        };
      }
      const { error } = await svc.from("cart_items").update({ quantity }).eq("id", own.item.id);
      if (error) return { ok: false, status: 500, error: "Could not update your cart." };
    }
    return { ok: true, view: await buildCartView(svc, own.cart) };
  } catch (e) {
    return serviceError(e);
  }
}

export async function removeCartItem(itemId: string): Promise<CartActionResult> {
  return setCartItemQty(itemId, 0);
}

export async function applyDiscountCode(code: string): Promise<CartActionResult> {
  try {
    const svc = requireShopServiceClient("cart discount");
    const cart = await getOrCreateCart();
    const view = await buildCartView(svc, cart);
    if (view.lines.length === 0) return { ok: false, status: 400, error: "Your cart is empty." };
    const normalized = code.trim().toUpperCase();
    const { error } = await svc.rpc("apply_discount_validation", {
      p_code: normalized,
      p_subtotal: view.subtotalCents / 100,
      p_customer_id: null,
    });
    if (error) return { ok: false, status: 400, error: error.message };
    const { error: saveError } = await svc
      .from("carts")
      .update({ discount_code: normalized })
      .eq("id", cart.id)
      .eq("guest_token", cart.guest_token);
    if (saveError) return { ok: false, status: 500, error: "Could not apply the code. Try again." };
    return { ok: true, view: await buildCartView(svc, { ...cart, discount_code: normalized }) };
  } catch (e) {
    return serviceError(e);
  }
}

export async function removeDiscountCode(): Promise<CartActionResult> {
  try {
    const svc = requireShopServiceClient("cart discount remove");
    const cart = await findCart(svc);
    if (!cart) return { ok: false, status: 404, error: "No cart found." };
    const { error } = await svc
      .from("carts")
      .update({ discount_code: null })
      .eq("id", cart.id)
      .eq("guest_token", cart.guest_token);
    if (error) return { ok: false, status: 500, error: "Could not remove the code." };
    return { ok: true, view: await buildCartView(svc, { ...cart, discount_code: null }) };
  } catch (e) {
    return serviceError(e);
  }
}

/** Re-export so route handlers can read the caller without extra imports. */
export async function currentUserId(): Promise<string | null> {
  const client = await createShopUserClient();
  return getSessionUserId(client);
}
