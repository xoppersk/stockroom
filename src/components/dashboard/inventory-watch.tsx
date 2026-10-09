import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WatchRow {
  productTitle: string;
  variantTitle: string;
  sku: string;
  onHand: number;
  reorderAt: number;
}

/**
 * Inventory watch — the Signature UI stock table (Flagship UI Designs,
 * stockroomProto). Bordered ledger card, dashed row rules, dotted product
 * leaders, mono tabular counts, and the underline status style
 * (healthy / low / out). Data rows are 56px (System §01).
 */
export function InventoryWatch({
  countedLabel,
  rows,
}: {
  countedLabel: string;
  rows: WatchRow[];
}) {
  return (
    <section aria-label="Inventory watch" className="border border-border bg-card p-4">
      <div className="mb-[13px] flex items-center justify-between">
        <div className="grid gap-[3px]">
          <strong className="text-[11px] font-semibold">Inventory watch</strong>
          <span className="text-[8px] text-muted-foreground">Counted {countedLabel}</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/inventory?alert=low">Open inventory</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          All stocked up — nothing below threshold.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="text-left font-medium text-muted-foreground">
                <th className="border-b border-border px-1.5 py-2 font-medium">Product</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">SKU</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">On hand</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">Reorder at</th>
                <th className="border-b border-border px-1.5 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status =
                  row.onHand <= 0 ? "Out of stock" : row.onHand < row.reorderAt ? "Low stock" : "Healthy";
                return (
                  <tr
                    key={row.sku}
                    className="h-[56px] border-b border-dashed border-border last:border-0"
                  >
                    <td className="px-1.5 py-2.5">
                      <span className="flex items-end gap-1.5">
                        <span className="shrink-0">
                          {row.productTitle}
                          {row.variantTitle ? ` — ${row.variantTitle}` : ""}
                        </span>
                        <i aria-hidden className="mb-1 min-w-6 flex-1 border-b border-dotted border-[#b6aa99]" />
                      </span>
                    </td>
                    <td className="tnum whitespace-nowrap px-1.5 py-2.5 font-mono">{row.sku}</td>
                    <td className="tnum px-1.5 py-2.5 text-right font-mono">{row.onHand}</td>
                    <td className="tnum px-1.5 py-2.5 text-right font-mono">{row.reorderAt}</td>
                    <td className="whitespace-nowrap px-1.5 py-2.5 text-right">
                      <span
                        className={cn(
                          "inline-block border-b-2 pb-0.5 font-display text-[8px] font-semibold uppercase tracking-[0.08em]",
                          status === "Healthy" && "border-[#8a857c] text-[#5d5a53]",
                          status === "Low stock" && "border-[#d97706] text-[#a95412]",
                          status === "Out of stock" && "border-destructive text-destructive",
                        )}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
