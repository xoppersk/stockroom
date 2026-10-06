import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/lib/products/types";

/**
 * Status pill for products. Solid, unmistakable hues per the design brief —
 * a warehouse staffer should read the state at a glance.
 */
const STATUS_STYLES: Record<ProductStatus, string> = {
  published: "border-transparent bg-[#15803D]/12 text-[#15803D]",
  draft: "border-transparent bg-[#B45309]/12 text-[#B45309]",
  archived: "border-transparent bg-[#78716C]/15 text-[#57534E]",
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

export function ProductStatusBadge({
  status,
  className,
}: {
  status: ProductStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(STATUS_STYLES[status], className)}>{STATUS_LABELS[status]}</Badge>
  );
}
