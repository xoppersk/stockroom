import { Badge } from "@/components/ui/badge";
import {
  deriveDiscountStatus,
  DISCOUNT_STATUS_STYLES,
  type DiscountStatusInput,
} from "@/lib/discounts/status";
import { cn } from "@/lib/utils";

/**
 * Derived-status pill for a discount (Active / Scheduled / Paused / Expired),
 * computed from the stored status, schedule window, and redemption count.
 */
export function DiscountStatusBadge({
  discount,
  redemptionCount,
  className,
}: {
  discount: DiscountStatusInput;
  redemptionCount: number;
  className?: string;
}) {
  const status = deriveDiscountStatus(discount, redemptionCount);
  return (
    <Badge
      variant="secondary"
      className={cn(DISCOUNT_STATUS_STYLES[status], className)}
    >
      {status}
    </Badge>
  );
}
