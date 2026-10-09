/**
 * Derived discount status (DATABASE-SCHEMA.md §discounts).
 *
 * The stored `status` column is only 'active' | 'paused'. The effective
 * state is derived at read time:
 *   status='paused'                                    → Paused
 *   now() < starts_at                                    → Scheduled
 *   ends_at < now() OR usage limit reached               → Expired
 *   otherwise                                            → Active
 */

export type DerivedDiscountStatus = "Active" | "Scheduled" | "Paused" | "Expired";

export interface DiscountStatusInput {
  status: "active" | "paused";
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
}

export function deriveDiscountStatus(
  discount: DiscountStatusInput,
  redemptionCount: number,
  now: Date = new Date(),
): DerivedDiscountStatus {
  if (discount.status === "paused") return "Paused";
  if (now < new Date(discount.starts_at)) return "Scheduled";
  if (discount.ends_at !== null && now > new Date(discount.ends_at)) return "Expired";
  if (discount.usage_limit !== null && redemptionCount >= discount.usage_limit) {
    return "Expired";
  }
  return "Active";
}

/** Pill styling per derived status, using the Stockroom status tokens. */
export const DISCOUNT_STATUS_STYLES: Record<DerivedDiscountStatus, string> = {
  Active: "bg-success-soft text-success",
  Scheduled: "bg-info-soft text-info",
  Paused: "bg-warning-soft text-warning",
  Expired: "bg-neutral-soft text-neutral",
};
