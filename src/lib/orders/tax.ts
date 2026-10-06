/**
 * Tax for manual orders (Phase 4).
 *
 * Schema reality: `create_order_with_items` hardcodes `tax_total = 0` — the
 * migration defers tax to a later phase ("settings tax rate, shipping
 * rules"). Until a settings table exists, the new-order form quotes an
 * *estimated* tax line with this rate and submits tax-exclusive; the stored
 * order keeps tax_total = 0. The rate lives here (not scattered through the
 * UI) so wiring the real settings rate later is a one-line change.
 */
export const TAX_RATE = 0.0875;

export function taxLabel(): string {
  return `Est. tax (${(TAX_RATE * 100).toFixed(2).replace(/\.?0+$/, "")}%)`;
}

/** Mirror of the RPC's discount math: percentage rounds to cents, fixed caps at the subtotal. */
export function discountFor(
  subtotalCents: number,
  discount: { kind: "percentage" | "fixed"; value: number } | null,
): number {
  if (!discount) return 0;
  if (discount.kind === "percentage") {
    return Math.round((subtotalCents * discount.value) / 100);
  }
  return Math.min(Math.round(discount.value * 100), subtotalCents);
}

export function taxFor(taxableCents: number): number {
  return Math.round(taxableCents * TAX_RATE);
}
