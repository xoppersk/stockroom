import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStockStatus, type StockStatus } from "@/lib/products/utils";

/**
 * Stock status pill: OK (green) / Low (amber) / Out (red), with the count.
 * Mirrors the inventory module's pill language so the two read the same.
 */
const PILL_STYLES: Record<StockStatus, string> = {
  in: "border-transparent bg-[#15803D]/12 text-[#15803D]",
  low: "border-transparent bg-[#B45309]/12 text-[#B45309]",
  out: "border-transparent bg-[#DC2626]/12 text-[#DC2626]",
};

const PILL_LABELS: Record<StockStatus, string> = {
  in: "In stock",
  low: "Low",
  out: "Out",
};

export function StockPill({
  quantity,
  threshold,
  className,
}: {
  quantity: number;
  threshold: number;
  className?: string;
}) {
  const status = getStockStatus(quantity, threshold);
  return (
    <Badge className={cn(PILL_STYLES[status], "tabular-nums", className)}>
      {PILL_LABELS[status]} · {quantity}
    </Badge>
  );
}
