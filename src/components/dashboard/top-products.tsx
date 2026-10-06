import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export type TopProductRow = {
  productTitle: string;
  units: number;
  revenueCents: number;
};

/** Best sellers by revenue (last 30 days), from order line items. */
export function TopProducts({ rows }: { rows: TopProductRow[] }) {
  const max = Math.max(...rows.map((r) => r.revenueCents), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top products · 30d</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No sales in the last 30 days.
          </p>
        )}
        {rows.map((row, i) => (
          <div key={`${row.productTitle}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{row.productTitle}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {row.units} sold · <span className="font-semibold text-foreground">{formatMoney(row.revenueCents / 100)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (row.revenueCents / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
