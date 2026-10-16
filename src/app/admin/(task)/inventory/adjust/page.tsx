"use client";

/* O-02 — /admin/inventory/adjust (screens/StockAdjustment.html).
 * Canonical state is EC-WHT, 2 damaged. The dark Ledger preview recomputes
 * from the qty / reason inputs on every keystroke; saving calls the store's
 * adjustStock(sku, delta, reason) — the store signs the audit entry with
 * the current actor — so O-01 and X-03 move with it. Product + reason can
 * be seeded from the URL (?sku=, ?reason=) — X-03's "Count the shelf"
 * links here that way. */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TaskBar } from "@/components/sr/TaskBar";
import { listSkus } from "@/lib/api";
import { useShop, useShopState } from "@/lib/store";
import { money } from "@/lib/format";
import {
  auditRowsForSku,
  availableOf,
  toOpsSku,
  type OpsAuditRow,
  type OpsSku,
} from "@/app/admin/(shell)/inventory/_ops";

const REASONS = [
  "Counted",
  "Damaged",
  "Received",
  "Returned to stock",
  "Used in store",
  "Correction",
] as const;
type Reason = (typeof REASONS)[number];

const QTY_LABEL: Record<Reason, string> = {
  Counted: "Units counted",
  Damaged: "Units damaged",
  Received: "Units received",
  "Returned to stock": "Units returned",
  "Used in store": "Units used",
  Correction: "Units to correct",
};

const SAVE_VERB: Record<Reason, string> = {
  Counted: "counted",
  Damaged: "damaged",
  Received: "received",
  "Returned to stock": "returned",
  "Used in store": "used in store",
  Correction: "corrected",
};

const FALLBACK_SKU: OpsSku = {
  sku: "EC-WHT",
  name: "Enamel colander — White",
  variant: "White",
  productName: "Enamel colander",
  productSlug: "enamel-colander",
  productStatus: "active",
  shelf: "C-09",
  onShelf: 8,
  committed: 1,
  reorderPoint: 8,
  unitCostCents: 2150,
  committedOrder: "ORD-1049",
  previewNote:
    "ORD-1049 keeps its colander. The storefront still shows it in stock.",
  lastCountedLabel: "Oct 1",
  poSuggest: 12,
};

const FALLBACK_RECENT: OpsAuditRow[] = [
  { when: "Oct 6", label: "ORD-1049 reserved", deltaLabel: "−1" },
  { when: "Oct 1", label: "Counted by Kofi, matched", deltaLabel: "0", tone: "paid" },
  { when: "Sep 24", label: "Received PO-0201", deltaLabel: "+12" },
];

function deltaFor(reason: Reason, qty: number, onShelf: number): number {
  switch (reason) {
    case "Damaged":
    case "Used in store":
    case "Correction":
      return -qty;
    case "Received":
    case "Returned to stock":
      return qty;
    case "Counted":
      return qty - onShelf;
  }
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="12"
      viewBox="0 0 22 12"
      fill="none"
      stroke="#8A847D"
      strokeWidth="1.8"
    >
      <path d="M1 6h19M15 1l5 5-5 5" />
    </svg>
  );
}

function AdjustInner() {
  const router = useRouter();
  const params = useSearchParams();
  const shop = useShop();
  const state = useShopState();

  const skuCode = (params.get("sku") ?? "EC-WHT").toUpperCase();
  const skus = useMemo(
    () => listSkus(state.products).map(toOpsSku),
    [state.products],
  );
  const product: OpsSku = useMemo(() => {
    const fromList = skus.find((s) => s.sku === skuCode);
    if (fromList) return fromList;
    return skuCode === "EC-WHT"
      ? FALLBACK_SKU
      : { ...FALLBACK_SKU, sku: skuCode, name: skuCode };
  }, [skus, skuCode]);

  const initialReason: Reason = REASONS.includes(
    (params.get("reason") ?? "") as Reason,
  )
    ? (params.get("reason") as Reason)
    : "Damaged";
  const [reason, setReason] = useState<Reason>(initialReason);
  const [qty, setQty] = useState<number>(initialReason === "Counted" ? product.onShelf : 2);
  const [disposition, setDisposition] = useState("Write off and discard");
  const [note, setNote] = useState(
    product.sku === "EC-WHT"
      ? "Chipped enamel on the rim, found while restocking C-09."
      : "",
  );
  const [changeText, setChangeText] = useState("");
  const [poPressed, setPoPressed] = useState(false);

  const delta = deltaFor(reason, qty, product.onShelf);
  const afterShelf = product.onShelf + delta;
  const availNow = availableOf(product);
  const afterAvail = afterShelf - product.committed;
  const unitCost = product.unitCostCents ?? 0;
  const costTotal = Math.abs(delta) * unitCost;
  const belowAfter = afterAvail < product.reorderPoint;
  const poQty =
    product.poSuggest ?? Math.max(1, product.reorderPoint * 2 - afterAvail);

  /* Recent changes: adjustments made in this session (AU-LOCAL-*) lead,
     then the screen's canonical history for EC-WHT, else any seeded audit
     entries that mention the SKU. */
  const auditRows = useMemo(() => {
    const local = auditRowsForSku(
      state.audit.filter((e) => e.id.startsWith("AU-LOCAL-")),
      product.sku,
    );
    if (product.sku === "EC-WHT") return [...local, ...FALLBACK_RECENT];
    return [...local, ...auditRowsForSku(state.audit, product.sku)];
  }, [state.audit, product.sku]);

  function pickReason(r: Reason) {
    setReason(r);
    if (r === "Counted") setQty(product.onShelf);
    else if (reason === "Counted") setQty(2);
  }

  function tryChangeProduct() {
    const code = changeText.trim().toUpperCase();
    if (!code) return;
    if (skus.some((s) => s.sku === code)) {
      router.replace(`/admin/inventory/adjust?sku=${code}`);
      setChangeText("");
    }
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (delta !== 0) {
      /* The store signs the entry with the current actor itself
         (adjustStock's actor argument is optional). */
      shop.adjustStock(product.sku, delta, reason);
    }
    router.push("/admin/inventory");
  }

  return (
    <div className="sr-page">
      <div className="ops-task-grid">
        <form
          className="ops-stack"
          style={{ gap: 22 }}
          onSubmit={onSave}
        >
          <div className="ops-task-head">
            <Link className="ops-backlink" href="/admin/inventory">
              ← Inventory
            </Link>
            <h1 className="ops-h1">Adjust stock</h1>
            <span className="ops-task-sub">
              Every adjustment needs a reason. Nothing changes until you record
              it.
            </span>
          </div>

          <section className="panel" aria-labelledby="ops-adj-w">
            <div className="ph">
              <h2 id="ops-adj-w">What changed</h2>
            </div>
            <div className="ops-form-body">
              <div className="f">
                <label htmlFor="ops-adj-sku">Product</label>
                <div className="ops-product-box">
                  <span className="ops-product-tile" aria-hidden="true">
                    {product.sku.split("-")[0]}
                  </span>
                  <span className="ops-product-meta">
                    <b>{product.name}</b>
                    <span className="mono">
                      {product.sku} · shelf {product.shelf ?? "—"}
                      {product.lastCountedLabel
                        ? ` · last counted ${product.lastCountedLabel}`
                        : ""}
                    </span>
                  </span>
                  <input
                    id="ops-adj-sku"
                    className="ops-change-input"
                    type="search"
                    aria-label="Change product"
                    placeholder="Change"
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    onBlur={tryChangeProduct}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        tryChangeProduct();
                      }
                    }}
                  />
                </div>
              </div>

              <fieldset className="ops-fieldset">
                <legend className="lb">Reason</legend>
                <div className="ops-chips">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="rs"
                      aria-pressed={reason === r}
                      onClick={() => pickReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="ops-form-grid2">
                <div className="f">
                  <label htmlFor="ops-adj-q">{QTY_LABEL[reason]}</label>
                  <div className="ops-stepper">
                    <button
                      type="button"
                      aria-label="One fewer"
                      onClick={() => setQty((q) => Math.max(0, q - 1))}
                    >
                      −
                    </button>
                    <input
                      id="ops-adj-q"
                      value={qty}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(/[^0-9]/g, ""));
                        setQty(Number.isNaN(v) ? 0 : v);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="One more"
                      onClick={() => setQty((q) => q + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="ops-adj-dsp">What happens to them</label>
                  <select
                    id="ops-adj-dsp"
                    className="in"
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value)}
                  >
                    <option>Write off and discard</option>
                    <option>Sell as seconds</option>
                    <option>Return to supplier</option>
                  </select>
                </div>
              </div>

              <div className="f">
                <label htmlFor="ops-adj-nt">Note for the ledger</label>
                <input
                  id="ops-adj-nt"
                  className="in"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <label className="ops-photo" htmlFor="ops-adj-ph">
                Add a photo of the damage{" "}
                <span>(optional, kept with the record)</span>
                <input id="ops-adj-ph" type="file" accept="image/*" />
              </label>
            </div>
          </section>

          <div className="ops-form-actions">
            <Link href="/admin/inventory" className="btn lg">
              Cancel
            </Link>
            <button type="submit" className="btn lg tape">
              Record {qty} {SAVE_VERB[reason]}
            </button>
          </div>
        </form>

        <aside aria-label="Before and after" className="ops-stack">
          <section
            className="panel ops-panel-dark"
            aria-labelledby="ops-adj-pv"
          >
            <div className="ph">
              <h2 id="ops-adj-pv">Ledger preview</h2>
              <span className="mono">{product.sku}</span>
            </div>
            <div className="ops-preview-body">
              <div className="cmp head">
                <span></span>
                <span style={{ textAlign: "right" }}>Now</span>
                <span></span>
                <span style={{ textAlign: "right", color: "#F0B35A" }}>
                  After
                </span>
              </div>
              <div className="cmp">
                <span className="cmp-label">On shelf</span>
                <span className="fig">{product.onShelf}</span>
                <Arrow />
                <span className="fig">{afterShelf}</span>
              </div>
              <div className="cmp">
                <span className="cmp-label">
                  Committed{product.committedOrder ? ` to ${product.committedOrder}` : ""}
                </span>
                <span className="fig small">{product.committed}</span>
                <Arrow />
                <span className="fig small">{product.committed}</span>
              </div>
              <div className="cmp">
                <span className="cmp-label strong">Available to sell</span>
                <span className="fig">{availNow}</span>
                <Arrow />
                <span className="fig after">{afterAvail}</span>
              </div>
            </div>
            <div className="ops-preview-foot">
              {delta < 0 && unitCost > 0 && (
                <span>
                  Written off at cost:{" "}
                  <b>
                    {Math.abs(delta)} × {money(unitCost)} = {money(costTotal)}
                  </b>
                </span>
              )}
              {delta > 0 && unitCost > 0 && (
                <span>
                  Added at cost:{" "}
                  <b>
                    {delta} × {money(unitCost)} = {money(costTotal)}
                  </b>
                </span>
              )}
              {product.previewNote && afterAvail > 0 ? (
                <span>{product.previewNote}</span>
              ) : afterAvail > 0 ? (
                <span>The storefront still shows it in stock.</span>
              ) : (
                <span>The storefront will show it as sold out.</span>
              )}
              {belowAfter && (
                <>
                  <span className="warn">
                    {afterAvail} is below the reorder point of{" "}
                    {product.reorderPoint}.{" "}
                    {product.incomingQty
                      ? `${product.incomingQty} arrive ${product.incomingDay ?? ""} on ${product.incomingPo ?? "order"}.`
                      : "Nothing is on order for this SKU."}
                  </span>
                  {!product.incomingQty && (
                    <button
                      type="button"
                      className="btn"
                      aria-pressed={poPressed}
                      onClick={() => setPoPressed((p) => !p)}
                    >
                      Start a purchase order for {poQty}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {auditRows.length > 0 && (
            <section className="panel" aria-labelledby="ops-adj-rh">
              <div className="ph">
                <h2 id="ops-adj-rh">Recent changes to {product.sku}</h2>
              </div>
              <div className="ops-recent-wrap">
                {auditRows.map((r, i) => (
                  <div className="ops-recent-row" key={`${r.when}-${i}`}>
                    <span className="when">{r.when}</span>
                    <span>{r.label}</span>
                    <b className={`delta${r.tone === "paid" ? " paid" : ""}`}>
                      {r.deltaLabel}
                    </b>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function AdjustStockPage() {
  return (
    <>
      <TaskBar
        title="Adjust stock"
        closeLabel="Cancel"
        closeHref="/admin/inventory"
      />
      <Suspense fallback={null}>
        <AdjustInner />
      </Suspense>
    </>
  );
}
