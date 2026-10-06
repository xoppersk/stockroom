import { z } from "zod";

/**
 * Zod schemas for the Discounts module (Phase 6).
 *
 * Codes are normalized to UPPERCASE (the DB trigger does this too, but we
 * normalize client-side so duplicate detection and error messages are
 * predictable). Money arrives from FormData as strings and is coerced.
 */

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;

export const discountCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => CODE_PATTERN.test(v), {
    message:
      "Code must be 3–24 characters: letters, numbers, dashes, underscores.",
  });

const moneyString = (field: string, { min = 0 }: { min?: number } = {}) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "", { message: `${field} is required.` })
    .refine((v) => !Number.isNaN(Number(v)), { message: `${field} must be a number.` })
    .refine((v) => Number(v) >= min, {
      message: `${field} must be at least ${min}.`,
    })
    .transform((v) => Number(v));

const optionalPositiveInt = (field: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(
      z
        .string()
        .refine((v) => /^\d+$/.test(v), { message: `${field} must be a whole number.` })
        .transform((v) => Number(v))
        .refine((v) => v > 0, { message: `${field} must be greater than 0.` })
        .nullable(),
    );

export const discountKindSchema = z.enum(["percentage", "fixed"]);
export type DiscountKind = z.infer<typeof discountKindSchema>;

export const discountSchema = z
  .object({
    code: discountCodeSchema,
    kind: discountKindSchema,
    value: moneyString("Value", { min: 0.01 }),
    usage_limit: optionalPositiveInt("Usage limit"),
    per_customer_limit: optionalPositiveInt("Per-customer limit"),
    min_order_value: z
      .string()
      .trim()
      .transform((v) => (v === "" ? 0 : Number(v)))
      .pipe(
        z
          .number()
          .refine((v) => !Number.isNaN(v), { message: "Minimum order must be a number." })
          .refine((v) => v >= 0, { message: "Minimum order can't be negative." }),
      ),
    starts_at: z
      .string()
      .trim()
      .min(1, "Start date is required.")
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Start date is invalid." }),
    ends_at: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(
        z
          .string()
          .refine((v) => !Number.isNaN(Date.parse(v)), { message: "End date is invalid." })
          .nullable(),
      ),
    start_paused: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
  })
  .refine((v) => v.kind !== "percentage" || v.value <= 100, {
    message: "Percentage value can't exceed 100.",
    path: ["value"],
  })
  .refine(
    (v) =>
      v.ends_at === null || Date.parse(v.ends_at) > Date.parse(v.starts_at),
    {
      message: "End date must be after the start date.",
      path: ["ends_at"],
    },
  );

export type DiscountFormValues = z.infer<typeof discountSchema>;

/**
 * One-time apology code (APP-FLOW.md §"Issue apology code"). The server
 * action hard-enforces: kind='percentage', usage_limit=1,
 * per_customer_limit=1, valid 14 days.
 */
export const apologyCodeSchema = z.object({
  customer_id: z.string().uuid("Select a valid customer."),
  percent: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v), { message: "Percent must be a whole number." })
    .transform((v) => Number(v))
    .refine((v) => v >= 1 && v <= 50, {
      message: "Apology codes are between 1% and 50%.",
    }),
});

export type ApologyCodeValues = z.infer<typeof apologyCodeSchema>;

/** Code validation tester (used by the discounts page "Test a code" tool). */
export const validateCodeSchema = z.object({
  code: z.string().trim().min(1, "Enter a code to test."),
  subtotal: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Number(v)), {
      message: "Subtotal must be a number.",
    })
    .transform((v) => (v === "" ? 0 : Number(v)))
    .refine((v) => v >= 0, { message: "Subtotal can't be negative." }),
  customer_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().uuid("Customer id is invalid.").nullable()),
});

export type ValidateCodeValues = z.infer<typeof validateCodeSchema>;

/**
 * Distinct validation failure reasons surfaced by
 * `apply_discount_validation` (migrations/00007_discounts.sql). The server
 * action maps the function's raised messages onto these.
 */
export const DISCOUNT_FAILURE_REASONS = [
  "expired",
  "limit-reached",
  "min-order-not-met",
  "paused",
  "scheduled",
  "invalid",
] as const;

export type DiscountFailureReason = (typeof DISCOUNT_FAILURE_REASONS)[number];

export const DISCOUNT_FAILURE_COPY: Record<DiscountFailureReason, string> = {
  expired: "This code has expired.",
  "limit-reached": "This code has reached its usage limit.",
  "min-order-not-met": "This order doesn't meet the code's minimum order value.",
  paused: "This code is paused.",
  scheduled: "This code isn't active yet.",
  invalid: "This code wasn't found.",
};
