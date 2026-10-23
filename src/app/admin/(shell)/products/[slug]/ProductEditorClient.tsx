"use client";

/* C-05 Product editor — screens/ProductEditor.html.
 * Client island: the server (page.tsx) passes a mapped EditorProduct
 * + collection list. Edits are written through the
 * updateProductDetails / updateVariantStock / updateVariantPrice
 * server actions (@/lib/shop/admin-actions) against the real catalog;
 * the header's dirty count, per-field “changed from” treatment and
 * beforeunload warning follow the screen's design. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { Button, type ButtonVariant } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { updateProductDetails, updateVariantPrice, updateVariantStock } from "@/lib/shop/admin-actions";

export type EditorVariant = {
  id: string;
  sku: string;
  label: string;
  onHand: number;
  reorderPoint: number;
  priceCents: number;
  shelf: string;
};

export type EditorProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  collection: string;
  supplier: string;
  backorder: boolean;
  sold30d: number;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number | null;
  variants: EditorVariant[];
};

const STATUS_TONE: Record<string, "paid" | "muted" | "tape"> = {
  active: "paid",
  draft: "tape",
  archived: "muted",
};

function parseMoneyToCents(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits.trim()) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function moneyInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function centsFieldProps() {
  return {
    inputMode: "decimal" as const,
    pattern: "^\\d*(\\.\\d{0,2})?$",
  };
}

export default function ProductEditorClient({
  product,
  collections,
}: {
  product: EditorProduct;
  collections: string[];
}) {
  const p = product;

  // Editable fields
  const [title, setTitle] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? "");
  const [price, setPrice] = useState(moneyInput(p.priceCents));
  const [compareAt, setCompareAt] = useState(moneyInput(p.compareAtCents));
  const [cost, setCost] = useState(moneyInput(p.costCents));
  const [collection, setCollection] = useState(p.collection);
  const [supplier, setSupplier] = useState(p.supplier ?? "");
  const [status, setStatus] = useState(p.status);
  const [variantRows, setVariantRows] = useState(
    p.variants.map((v) => ({
      ...v,
      price: moneyInput(v.priceCents),
      onHand: String(v.onHand),
      reorder: String(v.reorderPoint),
    })),
  );

  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Saved baseline (from the loaded product) — the “changed from” references.
  const saved = useMemo(
    () => ({
      title: p.name,
      description: p.description ?? "",
      price: moneyInput(p.priceCents),
      compareAt: moneyInput(p.compareAtCents),
      cost: moneyInput(p.costCents),
      collection: p.collection,
      supplier: p.supplier ?? "",
      status: p.status,
    }),
    [p],
  );

  const savedVariants = useMemo(() => p.variants, [p]);

  // Dirty tracking: list of changed field names
  const changed: string[] = [];
  if (title !== saved.title) changed.push("Title");
  if (description !== saved.description) changed.push("Description");
  if (price !== saved.price) changed.push("Price");
  if (compareAt !== saved.compareAt) changed.push("Compare-at price");
  if (cost !== saved.cost) changed.push("Cost per item");
  if (collection !== saved.collection) changed.push("Collection");
  if (supplier !== saved.supplier) changed.push("Supplier");
  if (status !== saved.status) changed.push("Status");
  const dirtyVariantRows = variantRows.filter((row) => {
    const base = savedVariants.find((v) => v.id === row.id);
    if (!base) return false;
    return (
      row.price !== moneyInput(base.priceCents) ||
      row.onHand !== String(base.onHand) ||
      row.reorder !== String(base.reorderPoint)
    );
  });
  const dirty = changed.length > 0 || dirtyVariantRows.length > 0;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  // Stock math for the header strip.
  const totalOnHand = variantRows.reduce((s, r) => s + (Number(r.onHand) || 0), 0);
  const lowCount = variantRows.filter((r) => {
    const qty = Number(r.onHand) || 0;
    const rp = Number(r.reorder) || 0;
    return qty <= rp;
  }).length;
  const totalValueCents =
    variantRows.reduce((s, r) => s + (Number(r.onHand) || 0), 0) * (parseMoneyToCents(cost) ?? 0);

  const margin =
    parseMoneyToCents(price) != null && (parseMoneyToCents(price) ?? 0) > 0
      ? (((parseMoneyToCents(price) ?? 0) - (parseMoneyToCents(cost) ?? 0)) / (parseMoneyToCents(price) ?? 1)) * 100
      : null;

  const discard = () => {
    setTitle(saved.title);
    setDescription(saved.description);
    setPrice(saved.price);
    setCompareAt(saved.compareAt);
    setCost(saved.cost);
    setCollection(saved.collection);
    setSupplier(saved.supplier);
    setStatus(saved.status);
    setVariantRows(
      savedVariants.map((v) => ({
        ...v,
        price: moneyInput(v.priceCents),
        onHand: String(v.onHand),
        reorder: String(v.reorderPoint),
      })),
    );
    setNotice(null);
  };

  const save = async () => {
    if (pending || !dirty) return;
    setPending(true);
    setNotice(null);
    try {
      const priceCents = parseMoneyToCents(price);
      if (price.trim() && priceCents == null) {
        throw new Error("Price doesn't look like an amount — use e.g. 64.00.");
      }
      if (title.trim() !== saved.title || priceCents !== p.priceCents || status !== saved.status ||
          description.trim() !== saved.description || collection !== saved.collection || supplier !== saved.supplier ||
          parseMoneyToCents(cost) !== p.costCents || parseMoneyToCents(compareAt) !== p.compareAtCents) {
        const res = await updateProductDetails({
          productId: p.id,
          title: title.trim(),
          description: description.trim(),
          priceCents: priceCents ?? p.priceCents,
          compareAtCents: compareAt.trim() ? parseMoneyToCents(compareAt) : null,
          costCents: cost.trim() ? parseMoneyToCents(cost) : null,
          collection: collection.trim() || null,
          supplier: supplier.trim() || null,
          status,
        });
        if (!res.ok) throw new Error(res.error ?? "Couldn't save the product.");
      }
      for (const row of dirtyVariantRows) {
        const base = savedVariants.find((v) => v.id === row.id);
        if (!base) continue;
        if (row.price !== moneyInput(base.priceCents)) {
          const pc = parseMoneyToCents(row.price);
          if (row.price.trim() && pc == null) throw new Error(`Variant ${row.sku}: price doesn't look like an amount.`);
          const res = await updateVariantPrice({ variantId: row.id, priceCents: pc ?? base.priceCents });
          if (!res.ok) throw new Error(res.error ?? `Couldn't save the price for ${row.sku}.`);
        }
        const onHandNum = Number(row.onHand);
        const reorderNum = Number(row.reorder);
        if (row.onHand !== String(base.onHand) || row.reorder !== String(base.reorderPoint)) {
          if (!Number.isInteger(onHandNum) || onHandNum < 0 || !Number.isInteger(reorderNum) || reorderNum < 0) {
            throw new Error(`Variant ${row.sku}: stock and reorder point must be whole numbers ≥ 0.`);
          }
          const res = await updateVariantStock({ variantId: row.id, onHand: onHandNum, reorderPoint: reorderNum });
          if (!res.ok) throw new Error(res.error ?? `Couldn't save stock for ${row.sku}.`);
        }
      }
      setNotice("Saved — every change is live in the store.");
      window.location.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setPending(false);
    }
  };

  const fieldClass = (isChanged: boolean) => `cc-in${isChanged ? " cc-in-unsaved" : ""}`;
  const changedFrom = (isChanged: boolean, from: string) =>
    isChanged ? <span className="cc-changed-from">Changed from {from || "—"} · not saved</span> : null;

  const statusTone: ButtonVariant | undefined = STATUS_TONE[status] as ButtonVariant | undefined;

  return (
    <>
      {/* Top band: title, status, dirty count, save */}
      <section className="cc-task-band" aria-labelledby="pe-t">
        <div className="cc-band-stack">
          <Link href="/admin/products" className="cc-backlink">← Products</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 id="pe-t" className="cc-h1" style={{ margin: 0 }}>{title || p.name}</h1>
            <Stamp tone={statusTone ?? "muted"}>{status}</Stamp>
            {dirty ? (
              <span className="cc-dirty-pill">{changed.length + dirtyVariantRows.length} unsaved change{changed.length + dirtyVariantRows.length === 1 ? "" : "s"}</span>
            ) : null}
          </div>
          <span className="cc-sub mono">{p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · {totalOnHand} on hand · {lowCount} at or below reorder point</span>
        </div>
        <div className="cc-band-actions">
          <Button onClick={discard} disabled={!dirty || pending}>Discard</Button>
          <Button href={`/products/${product.slug}`}>View in store ↗</Button>
          <Button variant="tape" size="lg" onClick={() => void save()} disabled={!dirty || pending}>
            {pending ? "Saving…" : `Save${dirty ? ` (${changed.length + dirtyVariantRows.length})` : ""}`}
          </Button>
        </div>
      </section>

      {/* Two-column: form + side rail */}
      <div className="sr-page sr-col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 24 }}>
          {/* Identity */}
          <section className="cc-panel" aria-labelledby="pe-id">
            <div className="cc-ph"><h2 id="pe-id">Identity</h2></div>
            <div className="cc-pb">
              <div className="cc-f">
                <label htmlFor="pe-title">Title</label>
                <input id="pe-title" className={fieldClass(title !== saved.title)} value={title} onChange={(e) => setTitle(e.target.value)} />
                {changedFrom(title !== saved.title, saved.title)}
              </div>
              <div className="cc-f">
                <label htmlFor="pe-desc">Description</label>
                <textarea id="pe-desc" rows={3} className={`cc-in cc-textarea${description !== saved.description ? " cc-in-unsaved" : ""}`} value={description} onChange={(e) => setDescription(e.target.value)} />
                {changedFrom(description !== saved.description, saved.description)}
              </div>
              <div className="cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="pe-price">Price</label>
                  <input id="pe-price" className={fieldClass(price !== saved.price)} value={price} {...centsFieldProps()} onChange={(e) => setPrice(e.target.value)} />
                  {changedFrom(price !== saved.price, saved.price ? money(parseMoneyToCents(saved.price) ?? 0) : "—")}
                </div>
                <div className="cc-f">
                  <label htmlFor="pe-compare">Compare-at price</label>
                  <input id="pe-compare" className={fieldClass(compareAt !== saved.compareAt)} value={compareAt} {...centsFieldProps()} onChange={(e) => setCompareAt(e.target.value)} />
                  {changedFrom(compareAt !== saved.compareAt, saved.compareAt ? money(parseMoneyToCents(saved.compareAt) ?? 0) : "—")}
                </div>
                <div className="cc-f">
                  <label htmlFor="pe-cost">Cost per item</label>
                  <input id="pe-cost" className={fieldClass(cost !== saved.cost)} value={cost} {...centsFieldProps()} onChange={(e) => setCost(e.target.value)} />
                  {changedFrom(cost !== saved.cost, saved.cost ? money(parseMoneyToCents(saved.cost) ?? 0) : "—")}
                </div>
              </div>
              <div className="cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="pe-collection">Collection</label>
                  <input id="pe-collection" className={fieldClass(collection !== saved.collection)} list="pe-collections" value={collection} onChange={(e) => setCollection(e.target.value)} />
                  <datalist id="pe-collections">
                    {collections.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {changedFrom(collection !== saved.collection, saved.collection)}
                </div>
                <div className="cc-f">
                  <label htmlFor="pe-supplier">Supplier</label>
                  <input id="pe-supplier" className={fieldClass(supplier !== saved.supplier)} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                  {changedFrom(supplier !== saved.supplier, saved.supplier)}
                </div>
                <div className="cc-f">
                  <label htmlFor="pe-status">Status</label>
                  <select id="pe-status" className={fieldClass(status !== saved.status)} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                  {changedFrom(status !== saved.status, saved.status)}
                </div>
              </div>
            </div>
          </section>

          {/* Variants */}
          <section className="cc-panel" aria-labelledby="pe-va">
            <div className="cc-ph">
              <h2 id="pe-va">Variants · {variantRows.length}</h2>
              <span style={{ fontSize: 12, color: "var(--slate)" }}>Stock, reorder point and price per variant</span>
            </div>
            <div className="cc-scroll">
              <div role="table" aria-label="Variants">
                <div role="row" className="cc-wiz-vr cc-wiz-vr-head">
                  <span role="columnheader">Variant</span>
                  <span role="columnheader">SKU</span>
                  <span role="columnheader">Shelf</span>
                  <span role="columnheader">Price</span>
                  <span role="columnheader">On hand</span>
                  <span role="columnheader">Reorder at</span>
                </div>
                {variantRows.map((row, i) => {
                  const base = savedVariants.find((v) => v.id === row.id);
                  const priceChanged = base ? row.price !== moneyInput(base.priceCents) : false;
                  const onHandChanged = base ? row.onHand !== String(base.onHand) : false;
                  const reorderChanged = base ? row.reorder !== String(base.reorderPoint) : false;
                  const onHandNum = Number(row.onHand) || 0;
                  const reorderNum = Number(row.reorder) || 0;
                  const low = onHandNum <= reorderNum;
                  return (
                    <div role="row" className="cc-wiz-vr" key={row.id}>
                      <b role="cell" style={{ fontWeight: 600 }}>{row.label}</b>
                      <span role="cell" className="mono" style={{ fontSize: 12 }}>{row.sku}</span>
                      <span role="cell" className="mono" style={{ fontSize: 12 }}>{row.shelf || "—"}</span>
                      <span role="cell">
                        <input
                          className={fieldClass(priceChanged)}
                          aria-label={`Price, ${row.label}`}
                          value={row.price}
                          {...centsFieldProps()}
                          style={{ textAlign: "right" }}
                          onChange={(e) =>
                            setVariantRows((prev) => prev.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))
                          }
                        />
                      </span>
                      <span role="cell">
                        <input
                          className={fieldClass(onHandChanged)}
                          aria-label={`On hand, ${row.label}`}
                          value={row.onHand}
                          inputMode="numeric"
                          style={{ textAlign: "right" }}
                          onChange={(e) =>
                            setVariantRows((prev) =>
                              prev.map((r, j) => (j === i ? { ...r, onHand: e.target.value.replace(/[^0-9]/g, "") } : r)),
                            )
                          }
                        />
                      </span>
                      <span role="cell">
                        <input
                          className={fieldClass(reorderChanged)}
                          aria-label={`Reorder at, ${row.label}`}
                          value={row.reorder}
                          inputMode="numeric"
                          style={{ textAlign: "right" }}
                          onChange={(e) =>
                            setVariantRows((prev) =>
                              prev.map((r, j) => (j === i ? { ...r, reorder: e.target.value.replace(/[^0-9]/g, "") } : r)),
                            )
                          }
                        />
                      </span>
                      {low ? (
                        <span role="cell" className="stamp" style={{ color: "#A15C00" }}>Low</span>
                      ) : (
                        <span role="cell" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="cc-sub" style={{ padding: "12px 20px" }}>
              The on-hand note: stock is the truth the storefront shows — a variant with 0 on hand shows “Sold out”
              to shoppers until stock arrives.
            </p>
          </section>

          {/* Back-order toggle */}
          <section className="cc-panel" aria-labelledby="pe-bo">
            <div className="cc-ph"><h2 id="pe-bo">Back-order</h2></div>
            <div className="cc-pb">
              <p style={{ margin: 0, fontSize: 13, color: "var(--slate)", lineHeight: 1.6 }}>
                {p.backorder
                  ? "This product allows back-orders — shoppers can order variants that are out of stock."
                  : "Back-orders are off — variants with 0 on hand show as sold out."}
                Back-order settings are managed in the product's catalog record; talk to a developer to change them.
              </p>
            </div>
          </section>

          {notice ? (
            <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p>
          ) : null}
        </div>

        {/* Side rail */}
        <aside aria-label="Product facts" className="sr-col-side" style={{ display: "grid", gap: 24 }}>
          <section className="cc-panel">
            <div className="cc-ph"><h2>Pricing</h2></div>
            <div className="cc-k" style={{ borderTop: 0 }}>
              <span className="cc-k-label">Margin</span>
              <b className="cc-k-value">{margin == null ? "—" : `${margin.toFixed(0)}%`}</b>
            </div>
            <div className="cc-k">
              <span className="cc-k-label">At cost ({cost.trim() ? `$${cost.trim()}` : "cost not set"})</span>
              <b className="cc-k-value">{money(totalValueCents)}</b>
            </div>
            <div className="cc-k">
              <span className="cc-k-label">Sold in the last 30 days</span>
              <b className="cc-k-value">{p.sold30d}</b>
            </div>
          </section>
          <section className="cc-panel">
            <div className="cc-ph"><h2>Stock health</h2></div>
            <div className="cc-k" style={{ borderTop: 0 }}>
              <span className="cc-k-label">Total on hand</span>
              <b className="cc-k-value">{totalOnHand}</b>
            </div>
            <div className="cc-k">
              <span className="cc-k-label">At or below reorder point</span>
              <b className="cc-k-value">{lowCount}</b>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
