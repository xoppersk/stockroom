"use client";

/* O-02 client island — layout preserved from the fixture build
   (screens/StockAdjustment.html); data arrives as props from the
   server page. Saving calls the real adjustStock server action →
   adjust_inventory RPC (admin/warehouse). RPC rejections surface in
   the form; nothing is recorded locally first.
 *
 * Drawn → DB reason map (00006 enum): Counted→recount,
 * Damaged→damaged, Received→restock_received, Returned to
 * stock→return, Used in store→manual, Correction→manual (the last
 * two carry their drawn label in the note text). */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adjustStock } from "@/lib/shop/admin-actions";
import { money } from "@/lib/format";
import type { AuditEntry, StockMovement } from "@/lib/types";
import {
  auditRowsForSku,
  availableOf,
  lastCountedLabelForSku,
  movementRowsForSku,
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

const DB_REASON: Record<Reason, string> = {
  Counted: "recount",
  Damaged: "damaged",
  Received: "restock_received",
  "Returned to stock": "return",
  "Used in store": "manual",
  Correction: "manual",
};

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

type Props = {
  skus: OpsSku[];
  audit: AuditEntry[];
  movements: StockMovement[];
};

export default function AdjustClient({ skus, audit, movements }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const skuCode = (params.get("sku") ?? "EC-WHT").toUpperCase();
  const product: OpsSku | undefined = useMemo(
    () => skus.find((s) => s.sku.toUpperCase() === skuCode),
    [skus, skuCode],
  );

  const initialReason: Reason = REASONS.includes(
    (params.get("reason") ?? "") as Reason,
  )
    ? (params.get("reason") as Reason)
    : "Damaged";
  const [reason, setReason] = useState<Reason>(initialReason);
  const [qty, setQty] = useState<number>(
    initialReason === "Counted" ? (product?.onShelf ?? 0) : 2,
  );
  const [disposition, setDisposition] = useState("Write off and discard");
  const [note, setNote] = useState("");
  const [changeText, setChangeText] = useState("");
  const [poPressed, setPoPressed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  /* Recent changes: today's real movements for this SKU lead (the
     feed that names SKUs), then any audit rows whose text names the
     SKU — see _ops.movementRowsForSku for why both are needed. */
  const auditRows = useMemo(() => {
    if (!product) return [];
    const fromMovements = movementRowsForSku(movements, product.sku);
    const fromAudit = auditRowsForSku(audit, product.sku);
    const seen = new Set(fromMovements.map((r) => `${r.label}|${r.deltaLabel}`));
    return [
      ...fromMovements,
      ...fromAudit.filter((r) => !seen.has(`${r.label}|${r.deltaLabel}`)),
    ].slice(0, 4);
  }, [audit, movements, product]);
  const lastCountedLabel = useMemo(() => {
    if (!product) return undefined;
    if (movements.some((m) => m.sku === product.sku && m.kind === "recount")) {
      return "today";
    }
    return lastCountedLabelForSku(audit, product.sku);
  }, [audit, movements, product]);

  if (!product) {
    return (
      <div className="sr-page">
        <section className="panel" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 12px" }}>
            No SKU called <span className="mono">{skuCode}</span> is on the
            shelves, so there is nothing to adjust.
          </p>
          <Link className="btn" href="/admin/inventory">
            ← Inventory
          </Link>
        </section>
      </div>
    );
  }

  const delta = deltaFor(reason, qty, product.onShelf);
  const afterShelf = product.onShelf + delta;
  const availNow = availableOf(product);
  const afterAvail = afterShelf - product.committed;
  const unitCost = product.unitCostCents ?? 0;
  const costTotal = Math.abs(delta) * unitCost;
  const belowAfter = afterAvail < product.reorderPoint;
  const poQty = Math.max(1, product.reorderPoint * 2 - afterAvail);
  const variantId = product.variantId ?? product.sku;

  function pickReason(r: Reason) {
    setReason(r);
    if (r === "Counted") setQty(product!.onShelf);
    else if (reason === "Counted") setQty(2);
  }

  function tryChangeProduct() {
    const code = changeText.trim().toUpperCase();
    if (!code) return;
    if (skus.some((s) => s.sku.toUpperCase() === code)) {
      router.replace(`/admin/inventory/adjust?sku=${code}`);
      setChangeText("");
    }
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (delta === 0) {
      /* The append-only log has no zero-delta rows (the RPC raises on
         delta 0 by design): a matching count is honestly a no-op. */
      setNotice(
      );
      return;
    }
    const parts: string[] = [];
    if (reason === "Used in store") parts.push("Used in store");
    if (reason === "Correction") parts.push("Correction");
    if (reason === "Damaged") parts.push(`Disposition: ${disposition}`);
    if (note.trim()) parts.push(note.trim());
    const finalNote = parts.join(" — ") || undefined;
    startTransition(async () => {
      const res = await adjustStock(variantId, delta, DB_REASON[reason], finalNote);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push("/admin/inventory");
      router.refresh();
    });
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
                      {lastCountedLabel
                        ? ` · last counted ${lastCountedLabel}`
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
                <span>(optional — photo upload isn&apos;t enabled yet)</span>
                <input id="ops-adj-ph" type="file" accept="image/*" disabled />
              </label>
              {error ? (
                <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--problem)", fontWeight: 600 }}>
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>
                  {notice}
                </p>
              ) : null}
            </div>
          </section>

          <div className="ops-form-actions">
            <Link href="/admin/inventory" className="btn lg">
              Cancel
            </Link>
            <button type="submit" className="btn lg tape" disabled={pending}>
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
                <span className="cmp-label">Committed</span>
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
              {afterAvail > 0 ? (
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
