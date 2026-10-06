/**
 * Pure cart-total math. Prices are never stored on cart rows — totals are
 * computed live from `product_variants.price` (DB `numeric(12,2)` arrives as
 * a string) and re-computed server-side at checkout. This module is the
 * single implementation of that math, shared by `getCartDetails` and the
 * checkout flow, so the storefront and the Checkout Session can never
 * disagree on the amount.
 */

export interface CartLineInput {
  /** Live variant price (string from Postgres numeric, or number). */
  unitPrice: string | number;
  quantity: number;
}

export type CartDiscountKind = "percentage" | "fixed";

export interface CartDiscountInput {
  kind: CartDiscountKind;
  value: string | number;
}

export interface CartTotals {
  /** Subtotal before discount, rounded to cents. */
  subtotal: number;
  /** Discount amount, rounded to cents; 0 when no valid discount. */
  discountTotal: number;
  /** Amount the shopper pays: subtotal − discount, never negative. */
  total: number;
}

/** Round to whole cents (matches the SQL `round(..., 2)`). */
function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Subtotal from live variant prices — the client never dictates this. */
export function computeCartSubtotal(lines: CartLineInput[]): number {
  return roundCents(
    lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0),
  );
}

/**
 * Discount amount for a validated code. Mirrors `getCartDetails` and the
 * SQL `create_checkout_session`: percentage discounts are rounded to cents,
 * fixed discounts are capped at the subtotal (no negative totals).
 */
export function computeDiscountAmount(
  subtotal: number,
  kind: CartDiscountKind,
  value: string | number,
): number {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0 || subtotal <= 0) return 0;
  if (kind === "percentage") {
    return roundCents((subtotal * v) / 100);
  }
  return roundCents(Math.min(v, subtotal));
}

/** Full cart totals from live prices and an optional validated discount. */
export function computeCartTotals(
  lines: CartLineInput[],
  discount?: CartDiscountInput | null,
): CartTotals {
  const subtotal = computeCartSubtotal(lines);
  const discountTotal = discount ? computeDiscountAmount(subtotal, discount.kind, discount.value) : 0;
  return {
    subtotal,
    discountTotal,
    total: Math.max(0, roundCents(subtotal - discountTotal)),
  };
}
