import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { SignatureQueue } from "@/components/orders/signature-queue";

export const metadata: Metadata = { title: "Orders" };

/**
 * Orders — the signature fulfillment queue (Flagship UI Designs,
 * stockroomProto). The eight canonical orders with the status filter,
 * export, queue notes, fulfillment cut-off, and exception ownership —
 * every figure is the design's truth ledger (src/lib/truth-ledger.ts).
 */
export default async function OrdersPage() {
  const { role } = await requireRole(["admin", "warehouse", "support"], "/orders");
  const canCreate = role === "admin" || role === "support";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.13em] text-primary">
            Stockroom / Core
          </p>
          <h1 className="mt-1 font-display text-[27px] font-semibold leading-none tracking-[-0.05em]">
            Orders
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[10px] leading-relaxed text-muted-foreground">
            Work the fulfillment queue with payment, delivery, and exception
            status visible in every row.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Signature</Link>
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/orders/new">
                <Plus className="size-4" /> New order
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SignatureQueue />
    </div>
  );
}
