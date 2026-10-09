"use client";

import Link from "next/link";
import { useState } from "react";
import { PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockStatusPill } from "@/components/orders/status-pill";
import { cn } from "@/lib/utils";

import { AdjustDrawer, type InventoryRow } from "./adjust-drawer";

export type { InventoryRow };

/**
 * Variant stock table (desktop) / cards (mobile) with the adjust drawer.
 * The Adjust control only renders for roles that may move stock
 * (admin/warehouse) — support gets a read-only table.
 */
export function InventoryManager({
  rows,
  canAdjust,
  alertLow,
}: {
  rows: InventoryRow[];
  canAdjust: boolean;
  alertLow: boolean;
}) {
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {alertLow && (
        <p className="rounded-lg border border-[#B45309]/25 bg-[#B45309]/10 px-4 py-2.5 text-sm text-[#B45309]" role="status">
          Showing variants at or below their low-stock threshold.{" "}
          <Link href="/inventory" className="font-medium underline underline-offset-2">
            Show all
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <PackageSearch className="size-8 text-muted-foreground" />
          <h3 className="font-semibold tracking-tight">No variants match</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {alertLow
              ? "Nothing is low right now — the shelves are healthy."
              : "Try a different search, or check the filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  {canAdjust && <TableHead className="w-28"><span className="sr-only">Adjust</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.variantId} className="h-14">
                    <TableCell>
                      <div className="text-[13px] font-medium">{row.productTitle}</div>
                      <div className="text-xs text-muted-foreground">{row.variantTitle}</div>
                    </TableCell>
                    <TableCell className="tabular-nums text-[13px]">{row.sku}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        row.quantity <= 0 && "text-[#DC2626]",
                        row.quantity > 0 && row.quantity < row.threshold && "text-[#B45309]",
                      )}
                    >
                      {row.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.threshold}
                    </TableCell>
                    <TableCell>
                      <StockStatusPill quantity={row.quantity} threshold={row.threshold} />
                    </TableCell>
                    {canAdjust && (
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => setSelected(row)}
                        >
                          Adjust
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <div key={row.variantId} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{row.productTitle}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.variantTitle} · <span className="tabular-nums">{row.sku}</span>
                    </div>
                  </div>
                  <StockStatusPill quantity={row.quantity} threshold={row.threshold} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    <span className={cn("font-semibold text-foreground", row.quantity <= 0 && "text-[#DC2626]")}>
                      {row.quantity}
                    </span>{" "}
                    on hand · threshold {row.threshold}
                  </span>
                  {canAdjust && (
                    <Button variant="outline" size="sm" className="min-h-11" onClick={() => setSelected(row)}>
                      Adjust
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* key by variant: a fresh mount per variant resets the drawer form */}
      {canAdjust && (
        <AdjustDrawer
          key={selected?.variantId ?? "closed"}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
