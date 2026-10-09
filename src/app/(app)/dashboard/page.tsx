import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/auth/require-user";
import { requireRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { ExportOrdersButton } from "@/components/dashboard/export-orders-button";
import { InventoryWatch, type WatchRow } from "@/components/dashboard/inventory-watch";
import { OpsLedger, type OpsLedgerLine } from "@/components/dashboard/ops-ledger";
import { RevenuePostingChart } from "@/components/dashboard/revenue-posting-chart";
import {
  SIGNATURE_OPS_LINES,
  SIGNATURE_WATCH,
  SIGNATURE_WEEKS,
} from "@/lib/truth-ledger";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard — the Signature UI (Flagship UI Designs, stockroomProto).
 *
 * This is the fixed signature view: "Good morning, Sheku" on Tuesday,
 * October 6, 2026, the four-line operations ledger, the hand-rolled SVG
 * revenue posting for the four October weeks, and the inventory watch with
 * its four canonical rows. Every figure below is the design's truth ledger
 * (src/lib/truth-ledger.ts) — identical everywhere it appears.
 */
export default async function DashboardPage() {
  await requireUser("/dashboard");
  await requireRole(["admin", "warehouse", "support"], "/dashboard");

  const ledgerLines: OpsLedgerLine[] = SIGNATURE_OPS_LINES.map((l) => ({ ...l }));

  const watchRows: WatchRow[] = SIGNATURE_WATCH.map((w) => ({
    productTitle: w.product,
    variantTitle: w.variant,
    sku: w.sku,
    onHand: w.onHand,
    reorderAt: w.reorderAt,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Topline */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.05em]">
            Good morning, Sheku
          </h1>
          <p className="mt-1 text-[9px] text-muted-foreground">
            Tuesday, October 6, 2026 · Store operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportOrdersButton />
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="size-4" />
              New order
            </Link>
          </Button>
        </div>
      </div>

      <OpsLedger
        periodLabel="October 6"
        cutoffLabel="Fulfillment cut-off 2:00 PM"
        lines={ledgerLines}
      />

      <RevenuePostingChart
        weeks={SIGNATURE_WEEKS.map((w) => ({ ...w }))}
        monthLabel="October"
        year={2026}
      />

      <InventoryWatch countedLabel="October 6, 2026" rows={watchRows} />
    </div>
  );
}
