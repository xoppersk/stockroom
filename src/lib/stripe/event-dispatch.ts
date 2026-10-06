/**
 * Pure TypeScript mirror of the event dispatch inside `handle_stripe_event`
 * (supabase/migrations/00009_checkout_webhooks.sql).
 *
 * The database function is the source of truth — it runs the guarded,
 * forward-only transitions against live rows. This module captures the same
 * mapping as pure functions so the state machine is unit-testable without a
 * database: event type (+ refund amounts) → order/payment transition.
 */

export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded" | "cancelled" | "failed";
export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "cancelled";
export type OrderEventType =
  | "payment_succeeded"
  | "payment_failed"
  | "refund_issued";

export interface StripeOrderTransition {
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  orderEventType: OrderEventType;
  /** Whether the transition decrements stock (only payment success does). */
  decrementsStock: boolean;
}

export interface RefundAmounts {
  /** cents refunded on the charge (`amount_refunded`) */
  amountRefunded: number;
  /** total charge amount in cents (`amount`) */
  amount: number;
}

/**
 * Map an inbound Stripe event type to the order/payment transition the
 * webhook state machine applies. Returns `null` for event types the
 * handler records but does not dispatch (e.g. `invoice.*`).
 *
 * For `charge.refunded`, pass the charge amounts so partial refunds map to
 * `partially_refunded`; without amounts the conservative `refunded` is
 * returned and the DB layer resolves the exact status from the payload.
 */
export function mapStripeEventToTransition(
  eventType: string,
  refundAmounts?: RefundAmounts,
): StripeOrderTransition | null {
  switch (eventType) {
    case "checkout.session.completed":
    case "payment_intent.succeeded":
      return {
        paymentStatus: "succeeded",
        orderStatus: "paid",
        orderEventType: "payment_succeeded",
        decrementsStock: true,
      };
    case "payment_intent.payment_failed":
      return {
        paymentStatus: "failed",
        orderStatus: "failed",
        orderEventType: "payment_failed",
        decrementsStock: false,
      };
    case "charge.refunded": {
      const partial =
        refundAmounts !== undefined && refundAmounts.amountRefunded < refundAmounts.amount;
      return {
        paymentStatus: partial ? "partially_refunded" : "refunded",
        orderStatus: "refunded",
        orderEventType: "refund_issued",
        decrementsStock: false,
      };
    }
    default:
      return null;
  }
}

/**
 * Forward-only guard: a transition may only move an order/payment row out of
 * `pending` (into a terminal state) — retries and out-of-order deliveries
 * must never regress an order that already reached `paid`/`failed`.
 * Mirrors the `if v_order.status is distinct from 'pending'` checks in SQL.
 */
export function canApplyTransition(
  currentOrderStatus: OrderStatus,
  transition: StripeOrderTransition,
): boolean {
  if (transition.orderStatus === "refunded") {
    // Refunds apply to paid or fulfilled orders (the SQL checks
    // `v_order.status in ('paid', 'fulfilled')`).
    return currentOrderStatus === "paid" || currentOrderStatus === "fulfilled";
  }
  // paid / failed transitions only apply while the order is still pending.
  return currentOrderStatus === "pending";
}
