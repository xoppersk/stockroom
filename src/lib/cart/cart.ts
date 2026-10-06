"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  CART_COOKIE,
  createShopServiceClient,
  productImageUrl,
  type ShopCart,
} from "@/lib/shop/db";
import { computeCartTotals, computeDiscountAmount } from "./totals";

/**
 * Guest cart helpers + Server Actions for the storefront.
 *
 * Ownership model: the cart is identified by an unguessable uuid stored in
 * the HttpOnly `stockroom_cart` cookie. There is no per-request
 * `app.guest_token` setter RPC in the migrations, so these helpers use the
 * service-role client and enforce ownership in application code instead —
 * every query is scoped with `.eq("guest_token", token)`. The RLS
 * owner-only policies remain as defense in depth for the anon path.
 */

const CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_QTY = 99;

function cartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_MAX_AGE_SECONDS,
  };
}

/** The guest token from the HttpOnly cart cookie, or null when absent. */
export async function getCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/** Load the caller's cart by cookie token, creating one when needed. */
async function getOrCreateCart(): Promise<{ cart: ShopCart; token: string }> {
  const svc = createShopServiceClient();
  const store = await cookies();
  const existingToken = store.get(CART_COOKIE)?.value;

  if (existingToken) {
    const { data } = await svc
      .from("carts")
      .select("*")
      .eq("guest_token", existingToken)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      return { cart: data, token: existingToken };
    }
  }

  const { data, error } = await svc.from("carts").insert({}).select("*").single();
  if (error || !data) {
    throw new Error("Could not start a cart. Please try again.");
  }
  store.set(CART_COOKIE, data.guest_token, cartCookieOptions());
  return { cart: data, token: data.guest_token };
}

/** Total item quantity in the caller's cart — for the header badge. */
export async function getCartCount(): Promise<number> {
  const token = await getCartToken();
  if (!token) return 0;
  const svc = createShopServiceClient();
  const { data: cart } = await svc
    .from("carts")
    .select("id")
    .eq("guest_token", token)
    .maybeSingle();
  if (!cart) return 0;
  const { data: items } = await svc
    .from("cart_items")
    .select("quantity")
    .eq("cart_id", cart.id);
  return (items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

export interface CartLine {
  itemId: string;
  variantId: string;
  quantity: number;
  variantTitle: string;
  sku: string;
  unitPrice: string;
  compareAtPrice: string | null;
  productTitle: string;
  productSlug: string;
  imageUrl: string | null;
  imageAlt: string;
  stockOnHand: number;
  lowStockThreshold: number;
}

export interface CartDetails {
  lines: CartLine[];
  /** Subtotal before discount, as a number for math. */
  subtotal: number;
  discountCode: string | null;
  /** Discount amount as a number; 0 when no valid code. */
  discountTotal: number;
  /** Validation message for the stored code (e.g. expired) — null when fine. */
  discountMessage: string | null;
}

/** Full cart for rendering: lines with live prices, stock, and images. */
export async function getCartDetails(): Promise<CartDetails> {
  const empty: CartDetails = {
    lines: [],
    subtotal: 0,
    discountCode: null,
    discountTotal: 0,
    discountMessage: null,
  };
  const token = await getCartToken();
  if (!token) return empty;

  const svc = createShopServiceClient();
  const { data: cart } = await svc
    .from("carts")
    .select("id, discount_code, expires_at")
    .eq("guest_token", token)
    .maybeSingle();
  if (!cart || new Date(cart.expires_at).getTime() <= Date.now()) return empty;

  const { data: items } = await svc
    .from("cart_items")
    .select("id, variant_id, quantity")
    .eq("cart_id", cart.id)
    .order("added_at", { ascending: true });
  if (!items || items.length === 0) {
    return { ...empty, discountCode: cart.discount_code };
  }

  const variantIds = items.map((i) => i.variant_id);
  const { data: variants } = await svc
    .from("product_variants")
    .select("id, product_id, title, sku, price, compare_at_price")
    .in("id", variantIds);
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
  const { data: products } = await svc
    .from("products")
    .select("id, title, slug")
    .in("id", productIds);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const { data: images } = await svc
    .from("product_images")
    .select("product_id, storage_path, alt_text, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });
  const imageByProduct = new Map<string, { url: string; alt: string }>();
  for (const img of images ?? []) {
    if (!imageByProduct.has(img.product_id)) {
      imageByProduct.set(img.product_id, {
        url: productImageUrl(img.storage_path),
        alt: img.alt_text,
      });
    }
  }

  const { data: inventory } = await svc
    .from("inventory_levels")
    .select("variant_id, quantity_on_hand, low_stock_threshold")
    .in("variant_id", variantIds);
  const inventoryByVariant = new Map((inventory ?? []).map((i) => [i.variant_id, i]));

  const lines: CartLine[] = [];
  for (const item of items) {
    const variant = variantById.get(item.variant_id);
    const product = variant ? productById.get(variant.product_id) : undefined;
    if (!variant || !product) continue; // variant/product removed — skip stale line
    const inv = inventoryByVariant.get(variant.id);
    const img = imageByProduct.get(product.id);
    lines.push({
      itemId: item.id,
      variantId: variant.id,
      quantity: item.quantity,
      variantTitle: variant.title,
      sku: variant.sku,
      unitPrice: variant.price,
      compareAtPrice: variant.compare_at_price,
      productTitle: product.title,
      productSlug: product.slug,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? product.title,
      stockOnHand: inv?.quantity_on_hand ?? 0,
      lowStockThreshold: inv?.low_stock_threshold ?? 0,
    });
  }

  // Totals are pure math on the live variant prices (see ./totals.ts) —
  // the checkout route re-computes the same way from the DB.
  const { subtotal } = computeCartTotals(
    lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
  );

  let discountTotal = 0;
  let discountMessage: string | null = null;
  const discountCode = cart.discount_code?.trim() ? cart.discount_code.trim() : null;
  if (discountCode && subtotal > 0) {
    const { data: discount, error } = await svc.rpc("apply_discount_validation", {
      p_code: discountCode,
      p_subtotal: subtotal,
      p_customer_id: null,
    });
    if (error || !discount) {
      discountMessage =
        error?.message ?? "This code is no longer valid.";
    } else {
      discountTotal = computeDiscountAmount(
        subtotal,
        discount.kind === "fixed" ? "fixed" : "percentage",
        discount.value,
      );
    }
  }

  return { lines, subtotal, discountCode, discountTotal, discountMessage };
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

const addItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QTY),
});

/** Add a variant to the cart, then go to the cart page. */
export async function addItem(variantId: string, quantity: number): Promise<ActionResult> {
  const parsed = addItemSchema.safeParse({ variantId, quantity });
  if (!parsed.success) {
    return { ok: false, message: "That item could not be added." };
  }
  const svc = createShopServiceClient();

  const { data: variant } = await svc
    .from("product_variants")
    .select("id, product_id, title")
    .eq("id", parsed.data.variantId)
    .maybeSingle();
  if (!variant) {
    return { ok: false, message: "That item is no longer available." };
  }
  const { data: product } = await svc
    .from("products")
    .select("id, status")
    .eq("id", variant.product_id)
    .maybeSingle();
  if (!product || product.status !== "published") {
    return { ok: false, message: "That product is no longer available." };
  }
  const { data: inv } = await svc
    .from("inventory_levels")
    .select("quantity_on_hand")
    .eq("variant_id", variant.id)
    .maybeSingle();
  const onHand = inv?.quantity_on_hand ?? 0;

  const { cart } = await getOrCreateCart();
  const { data: existing } = await svc
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cart.id)
    .eq("variant_id", variant.id)
    .maybeSingle();

  const nextQty = (existing?.quantity ?? 0) + parsed.data.quantity;
  if (nextQty > onHand) {
    return {
      ok: false,
      message:
        onHand === 0
          ? "Sorry — that item is out of stock."
          : `Only ${onHand} available.`,
    };
  }

  if (existing) {
    const { error } = await svc
      .from("cart_items")
      .update({ quantity: nextQty })
      .eq("id", existing.id);
    if (error) return { ok: false, message: "Could not update your cart." };
  } else {
    const { error } = await svc.from("cart_items").insert({
      cart_id: cart.id,
      variant_id: variant.id,
      quantity: parsed.data.quantity,
    });
    if (error) return { ok: false, message: "Could not update your cart." };
  }

  redirect("/cart");
}

const qtySchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(0).max(MAX_QTY),
});

/** Load a cart line only if it belongs to the caller's cart. */
async function loadOwnLine(itemId: string) {
  const token = await getCartToken();
  if (!token) return null;
  const svc = createShopServiceClient();
  const { data: item } = await svc
    .from("cart_items")
    .select("id, cart_id, variant_id, quantity")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;
  const { data: cart } = await svc
    .from("carts")
    .select("id")
    .eq("id", item.cart_id)
    .eq("guest_token", token)
    .maybeSingle();
  if (!cart) return null;
  return { svc, item };
}

/** Set a line's quantity (0 removes it). */
export async function updateItemQty(itemId: string, quantity: number): Promise<ActionResult> {
  const parsed = qtySchema.safeParse({ itemId, quantity });
  if (!parsed.success) return { ok: false, message: "Invalid quantity." };
  const own = await loadOwnLine(parsed.data.itemId);
  if (!own) return { ok: false, message: "Item not found in your cart." };

  if (parsed.data.quantity === 0) {
    const { error } = await own.svc.from("cart_items").delete().eq("id", own.item.id);
    return error
      ? { ok: false, message: "Could not remove the item." }
      : { ok: true, message: "Removed from cart." };
  }

  const { data: inv } = await own.svc
    .from("inventory_levels")
    .select("quantity_on_hand")
    .eq("variant_id", own.item.variant_id)
    .maybeSingle();
  const onHand = inv?.quantity_on_hand ?? 0;
  if (parsed.data.quantity > onHand) {
    return {
      ok: false,
      message: onHand === 0 ? "Sorry — that item is out of stock." : `Only ${onHand} available.`,
    };
  }
  const { error } = await own.svc
    .from("cart_items")
    .update({ quantity: parsed.data.quantity })
    .eq("id", own.item.id);
  return error
    ? { ok: false, message: "Could not update your cart." }
    : { ok: true, message: "Cart updated." };
}

/** Remove a line from the cart. */
export async function removeItem(itemId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(itemId);
  if (!parsed.success) return { ok: false, message: "Item not found in your cart." };
  const own = await loadOwnLine(parsed.data);
  if (!own) return { ok: false, message: "Item not found in your cart." };
  const { error } = await own.svc.from("cart_items").delete().eq("id", own.item.id);
  return error
    ? { ok: false, message: "Could not remove the item." }
    : { ok: true, message: "Removed from cart." };
}

const codeSchema = z.object({ code: z.string().trim().min(1).max(32) });

/**
 * Validate a discount code live (expired / paused / limit / min-order
 * messages come straight from `apply_discount_validation`) and store it on
 * the cart when valid. Re-validated server-side again at checkout.
 */
export async function applyDiscountCode(code: string): Promise<ActionResult> {
  const parsed = codeSchema.safeParse({ code });
  if (!parsed.success) {
    return { ok: false, message: "Enter a discount code." };
  }
  const normalized = parsed.data.code.toUpperCase();
  const svc = createShopServiceClient();
  const { cart } = await getOrCreateCart();

  const { data: items } = await svc
    .from("cart_items")
    .select("quantity, variant_id")
    .eq("cart_id", cart.id);
  if (!items || items.length === 0) {
    return { ok: false, message: "Your cart is empty." };
  }
  const { data: variants } = await svc
    .from("product_variants")
    .select("id, price")
    .in("id", items.map((i) => i.variant_id));
  const priceById = new Map((variants ?? []).map((v) => [v.id, Number(v.price)]));
  const subtotal = items.reduce(
    (sum, i) => sum + (priceById.get(i.variant_id) ?? 0) * i.quantity,
    0,
  );

  const { error } = await svc.rpc("apply_discount_validation", {
    p_code: normalized,
    p_subtotal: Math.round(subtotal * 100) / 100,
    p_customer_id: null,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const { error: saveError } = await svc
    .from("carts")
    .update({ discount_code: normalized })
    .eq("id", cart.id);
  if (saveError) {
    return { ok: false, message: "Could not apply the code. Try again." };
  }
  return { ok: true, message: `Code ${normalized} applied.` };
}

/** Remove the stored discount code from the cart. */
export async function removeDiscountCode(): Promise<ActionResult> {
  const token = await getCartToken();
  if (!token) return { ok: true, message: "No code applied." };
  const svc = createShopServiceClient();
  const { error } = await svc
    .from("carts")
    .update({ discount_code: null })
    .eq("guest_token", token);
  return error
    ? { ok: false, message: "Could not remove the code." }
    : { ok: true, message: "Code removed." };
}
