import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStockStatus, type StockStatus } from "@/lib/products/utils";

/**
 * Stock status pill: OK (green) / Low (amber) / Out (red), with the count.
 * Mirrors the inventory module's pill language so the two read the same.
 */
const PILL_STYLES: Record<StockStatus, string> = {
  in: "border-transparent bg-success-soft text-success",
  low: "border-transparent bg-warning-soft text-warning",
  out: "border-transparent bg-destructive-soft text-destructive",
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
