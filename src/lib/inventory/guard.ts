/**
 * Inventory adjustment guard (pure mirror of the contract in
 * `_adjust_inventory()` — supabase/migrations/00006_inventory.sql).
 *
 * The real race-condition enforcement is the database: the function does
 * `SELECT quantity_on_hand ... FOR UPDATE`, which takes a row lock, so two
 * concurrent decrements serialize and the `v_after < 0` raise fires inside
 * the same transaction. This module captures that contract as pure
 * functions so the math is unit-testable without a database.
 */
export class InsufficientStockError extends Error {
  readonly quantityBefore: number;
  readonly delta: number;

  constructor(quantityBefore: number, delta: number) {
    super(`Insufficient stock: have ${quantityBefore}, cannot apply delta ${delta}.`);
    this.name = "InsufficientStockError";
    this.quantityBefore = quantityBefore;
    this.delta = delta;
  }
}

/**
 * Apply a stock delta and return the resulting on-hand quantity.
 * Mirrors the SQL: `v_after := v_before + p_delta; if v_after < 0 then raise`.
 *
 * @throws when delta is zero (the SQL rejects zero deltas) or when the
 *   result would go negative (stock can never go below zero, even under
 *   concurrent decrements).
 */
export function computeAdjustment(quantityBefore: number, delta: number): number {
  if (delta === 0) {
    throw new Error("Inventory delta must not be zero.");
  }
  const after = quantityBefore + delta;
  if (after < 0) {
    throw new InsufficientStockError(quantityBefore, delta);
  }
  return after;
}

/**
 * True when the move crosses the low-stock threshold downward — the
 * condition that fires the `low_stock` broadcast notification in SQL
 * (`v_after < v_threshold and v_before >= v_threshold`).
 */
export function crossesLowStockThreshold(
  quantityBefore: number,
  quantityAfter: number,
  threshold: number,
): boolean {
  return quantityAfter < threshold && quantityBefore >= threshold;
}
