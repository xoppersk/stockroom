import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/lib/products/types";

/**
 * Status pill for products. Solid, unmistakable hues per the design brief —
 * a warehouse staffer should read the state at a glance.
 */
const STATUS_STYLES: Record<ProductStatus, string> = {
  published: "border-transparent bg-success-soft text-success",
  draft: "border-transparent bg-warning-soft text-warning",
  archived: "border-transparent bg-neutral-soft text-neutral",
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
