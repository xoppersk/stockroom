/* Operations view adapter (W-OPS territory only).
 *
 * Real contracts (lib/types.ts, lib/api.ts, lib/store.tsx):
 *  - Live SKUs = listSkus(useShopState().products) — the store's Product[]
 *    is the ledger, so O-01 / O-02 / X-03 agree after adjustStock() or
 *    receiveDelivery().
 *  - Purchase orders are static fixtures; "received" lives in the store
 *    (state.receivedPoIds).
 *  - Audit entries are AuditEntry[] in the store; adjustStock() prepends an
 *    entry whose text names the SKU and whose oldValue/newValue carry the
 *    on-shelf change.
 * This module only reshapes those into what the Operations screens draw. */

import { getProduct } from "@/lib/api";
import type {
  AuditEntry,
  PurchaseOrder,
  Sku,
  StockMovement,
} from "@/lib/types";

export interface OpsSku {
  sku: string;
  name: string; // "Stoneware mug — Terracotta"
  displayName?: string; // screen-drawn override for the O-01 name cell
  variant: string; // "Terracotta"
  productName: string; // "Stoneware mug"
  productSlug: string;
  productStatus: string;
  shelf?: string;
  onShelf: number;
  committed: number;
  reorderPoint: number;
  incomingQty?: number;
  incomingDay?: string; // "Thu"
  incomingDateLabel?: string; // "Thu, Oct 8"
  incomingPo?: string; // "PO-0214"
  supplier?: string;
  countPending?: boolean;
  countNote?: string; // "counted 4, expected 6"
  unitCostCents?: number;
  committedOrder?: string; // "ORD-1049"
  previewNote?: string; // O-02 ledger-preview sentence drawn on the screen
  lastCountedLabel?: string; // "Oct 1"
  waitlist?: number;
  poSuggest?: number;
}

export interface OpsPurchaseOrder {
  id: string;
  supplier: string;
  etaLabel: string; // "Thursday, October 8"
  units: number;
  linesLabel: string; // "SM-TER ×48 · SM-MOS ×24"
}

export interface OpsMovement {
  time: string;
  label: string;
  skuLabel?: string;
  deltaLabel: string;
  tone?: "ink" | "tape" | "paid";
}

export interface OpsAuditRow {
  when: string; // "Oct 6"
  label: string;
  deltaLabel: string;
  tone?: "ink" | "paid";
}

export function availableOf(s: OpsSku): number {
  return s.onShelf - s.committed;
}

export type SkuStatus = "out" | "count" | "low" | "healthy";

export function statusOf(s: OpsSku): SkuStatus {
  if (availableOf(s) <= 0) return "out";
  if (s.countPending) return "count";
  if (availableOf(s) < s.reorderPoint) return "low";
  return "healthy";
}

export function toOpsSku(s: Sku): OpsSku {
  return withExtras({
    sku: s.sku,
    name: `${s.productName} — ${s.label}`,
    variant: s.label,
    productName: s.productName,
    productSlug: s.productSlug,
    productStatus: s.productStatus,
    shelf: s.shelf,
    onShelf: s.onShelf,
    committed: s.committed,
    reorderPoint: s.reorderPoint,
    incomingQty: s.incoming?.qty,
    incomingDay: s.incoming?.dayLabel.split(",")[0],
    incomingDateLabel: s.incoming?.dayLabel,
    incomingPo: s.incoming?.poId,
    supplier: getProduct(s.productSlug)?.supplier ?? undefined,
    countPending: s.countPending,
    unitCostCents: s.costCents ?? undefined,
    waitlist: s.waitlist,
  });
}

export function toOpsPos(pos: PurchaseOrder[]): OpsPurchaseOrder[] {
  return pos.map((p) => ({
    id: p.id,
    supplier: p.supplier,
    etaLabel: p.dayLabel,
    units: p.lines.reduce((a, l) => a + l.qty, 0),
    linesLabel: p.lines.map((l) => `${l.sku} ×${l.qty}`).join(" · "),
  }));
}

export function toOpsMovements(ms: StockMovement[]): OpsMovement[] {
  return ms.map((m) => ({
    time: m.timeLabel,
    label: m.text,
    skuLabel: m.sku ?? undefined,
    deltaLabel: m.deltaLabel,
    tone:
      m.deltaLabel === "?"
        ? "tape"
        : m.deltaLabel === "0"
          ? "paid"
          : undefined,
  }));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-10-06" → "Oct 6" (the Recent-changes date column). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

/** Store audit entries that mention this SKU, newest first. */
export function auditRowsForSku(
  audit: AuditEntry[],
  sku: string,
  limit = 4,
): OpsAuditRow[] {
  return audit
    .filter((e) => e.kind === "stock" && e.text.includes(sku))
    .slice(0, limit)
    .map((e) => {
      const oldN = e.oldValue != null ? Number(e.oldValue) : NaN;
      const newN = e.newValue != null ? Number(e.newValue) : NaN;
      const delta =
        !Number.isNaN(oldN) && !Number.isNaN(newN) ? newN - oldN : null;
      return {
        when: shortDate(e.dateISO),
        label: e.text,
        deltaLabel:
          delta === null
            ? ""
            : delta > 0
              ? `+${delta}`
              : delta < 0
                ? `−${Math.abs(delta)}`
                : "0",
        tone: delta === 0 ? "paid" : undefined,
      };
    });
}

/* Canonical fallbacks — the exact rows the approved screens draw, used only
   if a fixture read ever comes back empty for that panel. */
export const FALLBACK_MOVEMENTS: OpsMovement[] = [
  { time: "10:30", label: "Counter sale", skuLabel: "NP-4N", deltaLabel: "−2" },
  { time: "10:21", label: "ORD-1051 reserved", skuLabel: "WT-OAT", deltaLabel: "−1" },
  { time: "9:58", label: "Count mismatch flagged by Kofi", skuLabel: "CT-NAT", deltaLabel: "?", tone: "tape" },
  { time: "9:41", label: "ORD-1048 reserved", skuLabel: "LA-CHR, CT-NAT", deltaLabel: "−2" },
  { time: "7:30", label: "Morning count, aisle A · 22 SKUs matched", deltaLabel: "0", tone: "paid" },
];

export const FALLBACK_POS: OpsPurchaseOrder[] = [
  {
    id: "PO-0214",
    supplier: "Ashby Pottery",
    etaLabel: "Thursday, October 8",
    units: 72,
    linesLabel: "SM-TER ×48 · SM-MOS ×24",
  },
  {
    id: "PO-0215",
    supplier: "Baltic Linen Works",
    etaLabel: "Friday, October 9",
    units: 68,
    linesLabel: "LA-CHR ×24 · NP-4C ×20 · LA-RST ×12 · WT-RST ×12",
  },
];

/** Per-SKU canonical extras the screens draw but the stock fixture doesn't
 *  carry (HANDOVER §9 + StockAdjustment.html). */
export const SKU_EXTRAS: Record<string, Partial<OpsSku>> = {
  "EC-WHT": {
    committedOrder: "ORD-1049",
    previewNote:
      "ORD-1049 keeps its colander. The storefront still shows it in stock.",
    lastCountedLabel: "Oct 1",
    poSuggest: 12,
  },
  /* SR-15: Inventory.html draws this row's name as just "Canvas market
     tote" (no "— Natural") — the one row where the screen shortens. */
  "CT-NAT": { countNote: "counted 4, expected 6", displayName: "Canvas market tote" },
};

export function withExtras(s: OpsSku): OpsSku {
  const x = SKU_EXTRAS[s.sku];
  if (!x) return s;
  return {
    ...s,
    committedOrder: s.committedOrder ?? x.committedOrder,
    previewNote: s.previewNote ?? x.previewNote,
    lastCountedLabel: s.lastCountedLabel ?? x.lastCountedLabel,
    poSuggest: s.poSuggest ?? x.poSuggest,
    displayName: s.displayName ?? x.displayName,
    /* SR-01: the count note is drawn only while the count is pending.
       Recording the count clears countPending in the store, and the
       note clears with it — the settled shelf figure is the news. */
    countNote: s.countPending ? (s.countNote ?? x.countNote) : undefined,
  };
}
