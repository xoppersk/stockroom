import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockStatusPill } from "@/components/orders/status-pill";

export type LowStockRow = {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  threshold: number;
};

/** Operational urgency panel — shared with the inventory page's ?alert=low view. */
export function LowStockPanel({ rows }: { rows: LowStockRow[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="size-4 text-[#B45309]" aria-hidden="true" />
          Low stock
        </CardTitle>
        <Link href="/inventory?alert=low" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing is low — the shelves are healthy.
          </p>
        )}
        {rows.map((row) => (
          <Link
            key={row.variantId}
            href="/inventory?alert=low"
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{row.productTitle}</div>
              <div className="truncate text-xs text-muted-foreground tabular-nums">
                {row.variantTitle} · {row.sku}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{row.quantity}</span>
              <StockStatusPill quantity={row.quantity} threshold={row.threshold} />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
