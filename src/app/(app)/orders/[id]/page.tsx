import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryManager, type InventoryRow } from "@/components/inventory/inventory-table";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Inventory" };

type AdjustmentReason = Database["public"]["Tables"]["inventory_adjustments"]["Row"]["reason"];

const REASON_LABELS: Record<string, string> = {
  sale: "Sale",
  restock_received: "Restock received",
  damaged: "Damaged / lost",
  recount: "Recount correction",
  return: "Customer return",
  cancelled_order: "Cancelled order",
  manual: "Manual correction",
};

type SearchParams = {
  q?: string;
  alert?: string;
  hReason?: string;
  hActor?: string;
  hFrom?: string;
  hTo?: string;
};

/**
 * Inventory (Phase 5): summary cards, variant stock table with OK/Low/Out
 * pills, the adjust drawer (via the `adjust_inventory` RPC), the `?alert=low`
 * deep link, and a filterable adjustment history log.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { role } = await requireRole(["admin", "warehouse", "support"], "/inventory");
  const params = await searchParams;
  const supabase = await createClient();

  const alertLow = params.alert === "low";
  const canAdjust = role === "admin" || role === "warehouse";

  // --- Stock levels + variant/product info -----------------------------
  const { data: levels } = await supabase
    .from("inventory_levels")
    .select("variant_id, quantity_on_hand, low_stock_threshold")
    .limit(5000);

  const levelRows = levels ?? [];
  const totalUnits = levelRows.reduce((sum, l) => sum + l.quantity_on_hand, 0);
  const lowCount = levelRows.filter(
    (l) => l.quantity_on_hand > 0 && l.quantity_on_hand < l.low_stock_threshold,
  ).length;
  const outCount = levelRows.filter((l) => l.quantity_on_hand <= 0).length;

  const variantIds = levelRows.map((l) => l.variant_id);
  const { data: variants } = variantIds.length > 0
    ? await supabase
        .from("product_variants")
        .select("id, sku, title, product_id")
        .in("id", variantIds)
        .limit(5000)
    : { data: null };
  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
  const { data: products } = productIds.length > 0
    ? await supabase.from("products").select("id, title").in("id", productIds).limit(1000)
    : { data: null };
  const productTitle = new Map((products ?? []).map((p) => [p.id, p.title]));
  const levelOf = new Map(levelRows.map((l) => [l.variant_id, l]));

  const q = (params.q ?? "").trim().toLowerCase().replace(/[%_\\]/g, "");
  let rows: InventoryRow[] = (variants ?? []).map((v) => {
    const level = levelOf.get(v.id);
    return {
      variantId: v.id,
      sku: v.sku,
      variantTitle: v.title,
      productTitle: productTitle.get(v.product_id) ?? "Unknown product",
      quantity: level?.quantity_on_hand ?? 0,
      threshold: level?.low_stock_threshold ?? 0,
    };
  });
  if (q) {
    rows = rows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.variantTitle.toLowerCase().includes(q) ||
        r.productTitle.toLowerCase().includes(q),
    );
  }
  if (alertLow) {
    rows = rows.filter((r) => r.quantity < r.threshold);
  }
  rows.sort((a, b) => a.sku.localeCompare(b.sku));
  const shownRows = rows.slice(0, 200);

  // --- Adjustment history ------------------------------------------------
  const hActor = params.hActor;
  const hFrom = params.hFrom;
  const hTo = params.hTo;
  const hReason = params.hReason && params.hReason in REASON_LABELS ? params.hReason : undefined;

  let historyQuery = supabase
    .from("inventory_adjustments")
    .select("id, variant_id, delta, quantity_before, quantity_after, reason, reference, note, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (hReason) {
    historyQuery = historyQuery.eq("reason", hReason as AdjustmentReason);
  }
  if (hActor) historyQuery = historyQuery.eq("created_by", hActor);
  if (hFrom) historyQuery = historyQuery.gte("created_at", `${hFrom}T00:00:00Z`);
  if (hTo) historyQuery = historyQuery.lte("created_at", `${hTo}T23:59:59Z`);
  const { data: adjustments } = await historyQuery;

  const historyVariantIds = [...new Set((adjustments ?? []).map((a) => a.variant_id))];
  const { data: historyVariants } = historyVariantIds.length > 0
    ? await supabase.from("product_variants").select("id, sku, title").in("id", historyVariantIds)
    : { data: null };
  const historyVariantOf = new Map((historyVariants ?? []).map((v) => [v.id, v]));

  const historyActorIds = [...new Set((adjustments ?? []).map((a) => a.created_by).filter((id): id is string => id !== null))];
  const { data: staff } = await supabase.from("profiles").select("id, full_name").order("full_name");
  const actorName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const actorOptions = (staff ?? []).filter((s) => historyActorIds.includes(s.id)).map((s) => ({ id: s.id, name: s.full_name }));

  const summary = [
    { label: "Units on hand", value: totalUnits.toLocaleString("en-US"), tone: "text-foreground" },
    { label: "Low stock", value: String(lowCount), tone: lowCount > 0 ? "text-[#B45309]" : "text-foreground" },
    { label: "Out of stock", value: String(outCount), tone: outCount > 0 ? "text-[#DC2626]" : "text-foreground" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">
          Stock levels by variant. Every change needs a reason and lands in the history log.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </div>
              <div className={cn("mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums", card.tone)}>
                {card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <InventoryFilters actors={actorOptions} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Stock levels</h2>
        <InventoryManager rows={shownRows} canAdjust={canAdjust} alertLow={alertLow} />
        {rows.length > shownRows.length && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {shownRows.length} of {rows.length} variants — refine the search to see more.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Adjustment history</h2>
        {(adjustments ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No adjustments match these filters.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Before → after</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(adjustments ?? []).map((adj) => {
                    const variant = historyVariantOf.get(adj.variant_id);
                    return (
                      <TableRow key={adj.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {new Date(adj.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="text-[13px] font-medium tabular-nums">{variant?.sku ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{variant?.title ?? ""}</div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            adj.delta > 0 ? "text-[#15803D]" : "text-[#DC2626]",
                          )}
                        >
                          {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted-foreground">
                          {adj.quantity_before} → {adj.quantity_after}
                        </TableCell>
                        <TableCell className="text-[13px]">
                          {REASON_LABELS[adj.reason] ?? adj.reason}
                          {adj.note && (
                            <div className="max-w-48 truncate text-xs text-muted-foreground" title={adj.note}>
                              {adj.note}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-[13px] tabular-nums">{adj.reference ?? "—"}</TableCell>
                        <TableCell className="text-[13px]">
                          {adj.created_by ? (actorName.get(adj.created_by) ?? "—") : "System"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
