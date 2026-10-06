import { z } from "zod";

/**
 * Zod contracts for the Orders module (Phase 4). Every server action parses
 * its input against these before touching the database; the UI mirrors the
 * same constraints so errors surface inline instead of after a round trip.
 */

const uuid = z.string().uuid("That doesn't look like a valid id.");

export const OrderStatusValues = [
  "pending",
  "paid",
  "fulfilled",
  "refunded",
  "cancelled",
  "failed",
] as const;
export type OrderStatus = (typeof OrderStatusValues)[number];

export const FulfillOrderSchema = z.object({
  orderId: uuid,
  trackingNumber: z
    .string()
    .trim()
    .max(120, "Tracking numbers are at most 120 characters.")
    .optional(),
});
export type FulfillOrderInput = z.infer<typeof FulfillOrderSchema>;

export const BulkFulfillSchema = z.object({
  orderIds: z.array(uuid).min(1, "Pick at least one order.").max(100),
});
export type BulkFulfillInput = z.infer<typeof BulkFulfillSchema>;

export const RefundOrderSchema = z.object({
  orderId: uuid,
  /** Dollars, e.g. 24.5 — converted to integer cents before any math. */
  amount: z
    .number({ error: "Enter a refund amount." })
    .positive("The refund amount must be more than $0.")
    .max(999_999, "That amount is implausibly large — double-check it."),
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason — it goes on the timeline.")
    .max(500, "Keep the reason under 500 characters."),
});
export type RefundOrderInput = z.infer<typeof RefundOrderSchema>;

export const CancelOrderSchema = z.object({
  orderId: uuid,
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;

export const AddNoteSchema = z.object({
  orderId: uuid,
  note: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "Keep notes under 2000 characters."),
});
export type AddNoteInput = z.infer<typeof AddNoteSchema>;

const ShippingAddressSchema = z.object({
  line1: z.string().trim().max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(32).optional(),
  country: z.string().trim().max(64).optional(),
});
export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>;

export const NewOrderSchema = z.object({
  customerId: uuid,
  items: z
    .array(
      z.object({
        variantId: uuid,
        quantity: z
          .number({ error: "Quantity must be a number." })
          .int("Quantity must be a whole number.")
          .min(1, "Quantity must be at least 1.")
          .max(999, "Split quantities over 999 into a second order."),
      }),
    )
    .min(1, "Add at least one line item.")
    .max(50, "Fifty line items max per order."),
  discountCode: z.string().trim().max(32).optional(),
  shippingAddress: ShippingAddressSchema.optional(),
  note: z.string().trim().max(2000).optional(),
});
export type NewOrderInput = z.infer<typeof NewOrderSchema>;

export const ValidateDiscountSchema = z.object({
  code: z.string().trim().min(1, "Enter a code.").max(32),
  /** Order subtotal in dollars, before discount. */
  subtotal: z.number().nonnegative(),
  customerId: uuid.optional(),
});
export type ValidateDiscountInput = z.infer<typeof ValidateDiscountSchema>;

/** List-page filters, parsed from searchParams. */
export const OrderFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(OrderStatusValues).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type OrderFilters = z.infer<typeof OrderFiltersSchema>;
