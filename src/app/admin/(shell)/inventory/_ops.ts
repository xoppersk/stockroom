/* Operations view adapter (W-CATALOG territory).
 *
 * Real contracts (lib/types.ts view models via @/lib/shop/admin,
 * derivations via @/lib/derive):
 *  - SKUs arrive mapped from the DB: shelf + cost_price come from the
 *    00012 columns the mapper exposes (null until 00012 is applied —
 *    rendered as "—" / unknown, never invented); onShelf is the real
 *    inventory_levels quantity; reorderPoint is the real
 *    low_stock_threshold.
 *  - Incoming stock derives from OPEN purchase orders (00012 tables);
 *    when the mapper already sets Sku.incoming, that wins.
 *  - countNote derives from real recount adjustments only — when the
 *    mapper surfaces a countNote / lastRecount pair for a SKU with a
 *    count pending. No canon/fallback data lives here any more: the
 *    FALLBACK_* rows and SKU_EXTRAS blocks of the fixture build are
 *    gone by design (coordinator ruling 1/13).
 * This module only reshapes mapped view models into what the
 * Operations screens draw. */

import { availableOf } from "@/lib/derive";
import type {
  AuditEntry,
  PurchaseOrder,
  Sku,
  StockMovement,
} from "@/lib/types";

export { availableOf };

export interface OpsSku {
  sku: string;
  /** Variant uuid when the mapper surfaces it (actions need it). */
  variantId?: string;
  name: string; // "Stoneware mug — Terracotta"
  displayName?: string;
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
  countNote?: string; // "counted 4, expected 6" — real recounts only
  unitCostCents?: number;
  waitlist?: number;
  backorder?: boolean;
}

export interface OpsPurchaseOrder {
  id: string;
  supplier: string;
  etaLabel: string; // "Thursday, October 8"
  units: number;
  linesLabel: string; // "SM-TER ×48 · SM-MOS ×24"
  status: string;
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

export type SkuStatus = "out" | "count" | "low" | "healthy";

export function statusOf(s: OpsSku): SkuStatus {
  if (availableOf(s) <= 0) return "out";
  if (s.countPending) return "count";
  if (availableOf(s) < s.reorderPoint) return "low";
  return "healthy";
}

/** Optional real fields the mapper may surface beyond the base Sku
 *  shape (see W-CATALOG log, contract gap 3). All optional — absent
 *  means "not known", never a fixture substitute. */
type SkuExtras = {
  id?: string;
  variantId?: string;
  uuid?: string;
  supplier?: string | null;
  countNote?: string | null;
  lastRecount?: { counted: number; expected: number } | null;
  lastCountedLabel?: string | null;
};

export function toOpsSku(s: Sku, purchaseOrders: PurchaseOrder[] = []): OpsSku {
  const x = s as Sku & SkuExtras;
  const variantId = x.variantId ?? x.id ?? x.uuid;

  /* Incoming: the mapper's own incoming (derived from POs upstream)
     wins; otherwise derive from OPEN purchase orders in the list. */
  let incomingQty = s.incoming?.qty;
  let incomingDay = s.incoming?.dayLabel.split(",")[0];
  let incomingDateLabel = s.incoming?.dayLabel;
  let incomingPo = s.incoming?.poId;
  if (incomingQty == null) {
    for (const po of purchaseOrders) {
      if (po.status !== "open") continue;
      const line = po.lines.find((l) => l.sku === s.sku);
      if (!line) continue;
      incomingQty = line.qty;
      incomingDateLabel = po.dayLabel;
      incomingDay = po.dayLabel.split(",")[0];
      incomingPo = po.id;
      break;
    }
  }

  /* Count note: only while a count is pending, and only from a real
     recount the mapper surfaced — a direct countNote string, or the
     counted/expected pair of the last recount adjustment. */
  let countNote: string | undefined;
  if (s.countPending) {
    if (typeof x.countNote === "string" && x.countNote.length > 0) {
      countNote = x.countNote;
    } else if (x.lastRecount) {
      countNote = `counted ${x.lastRecount.counted}, expected ${x.lastRecount.expected}`;
    }
  }

  return {
    sku: s.sku,
    variantId,
    name: `${s.productName} — ${s.label}`,
    variant: s.label,
    productName: s.productName,
    productSlug: s.productSlug,
    productStatus: s.productStatus,
    shelf: s.shelf || undefined,
    onShelf: s.onShelf,
    committed: s.committed,
    reorderPoint: s.reorderPoint,
    incomingQty,
    incomingDay,
    incomingDateLabel,
    incomingPo,
    supplier: x.supplier ?? undefined,
    countPending: s.countPending,
    countNote,
    unitCostCents: s.costCents ?? undefined,
    waitlist: s.waitlist,
    backorder: s.backorder,
  };
}

export function toOpsPos(pos: PurchaseOrder[]): OpsPurchaseOrder[] {
  return pos.map((p) => ({
    id: p.id,
    supplier: p.supplier,
    etaLabel: p.dayLabel,
    units: p.lines.reduce((a, l) => a + l.qty, 0),
    linesLabel: p.lines.map((l) => `${l.sku} ×${l.qty}`).join(" · "),
    status: p.status,
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

/** Real audit entries that mention this SKU, newest first. */
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
        tone: delta === 0 ? ("paid" as const) : undefined,
      };
    });
}

/** Last counted label for a SKU from real audit rows (a recount entry
 *  naming the SKU), or undefined when no recount is on record. */
export function lastCountedLabelForSku(
  audit: AuditEntry[],
  sku: string,
): string | undefined {
  const hit = audit.find(
    (e) => e.kind === "stock" && e.text.includes(sku) && /count/i.test(e.text),
  );
  return hit ? shortDate(hit.dateISO) : undefined;
}

/** Recent-changes rows from TODAY's real movements for one SKU.
 *  Why this exists (W-CATALOG log gap 3): the mapped AuditEntry text
 *  for an inventory adjustment is "inventory.adjust · inventory_levels
 *  · <variant uuid>" — it names the variant UUID, not the SKU — so
 *  auditRowsForSku rarely matches real rows. todaysMovements() is the
 *  contract feed that DOES carry the SKU (from inventory_adjustments),
 *  so today's changes are derived from it; audit matches (when the
 *  text does name the SKU) are appended after. */
export function movementRowsForSku(
  movements: StockMovement[],
  sku: string,
  limit = 4,
): OpsAuditRow[] {
  return movements
    .filter((m) => m.sku === sku)
    .slice(0, limit)
    .map((m) => ({
      when: m.timeLabel,
      label: m.text,
      deltaLabel: m.deltaLabel,
      tone: m.deltaLabel === "0" ? ("paid" as const) : undefined,
    }));
}
