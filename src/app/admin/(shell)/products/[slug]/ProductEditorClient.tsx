"use client";

/* C-05 Product editor client island — markup preserved from the
   fixture build (screens/ProductEditor.html); the product arrives
   mapped from the DB via the server page. The editor opens CLEAN
   from real values (the fixture build's 2 pre-unsaved changes were
   demo theatre — adaptation A-PE-1). Dirty tracking + beforeunload
   guard are preserved over real edits.
 *
 * Save writes real actions (@/lib/shop/admin-actions):
 *   title/description → updateProduct · uniform price / compare-at /
 *   cost + shelf → updateVariant per variant · reorder inputs →
 *   setVariantThreshold (set_low_stock_threshold RPC) · status radio
 *   → setProductStatus (drawn active = DB published).
 * The first failing step stops the save and its reason is shown. */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import {
  setProductStatus,
  setVariantThreshold,
  updateProduct,
  updateVariant,
} from "@/lib/shop/admin-actions";
import { money } from "@/lib/format";
import { colourHex, isDarkBg } from "@/lib/shop/view";
import "@/styles/console-core.css";

export type EditorVariant = {
  id: string; // variant uuid when mapped, else the SKU code (log gap 1)
  sku: string;
  label: string;
  onHand: number;
  reorderPoint: number;
  priceCents: number;
  shelf: string;
};

export type EditorProduct = {
  id: string; // product uuid when mapped, else the slug (log gap 1)
  slug: string;
  name: string;
  description: string;
  status: "active" | "draft" | "archived";
  collection: string;
  supplier: string | null;
  backorder: boolean;
  sold30d: number;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number | null;
  variants: EditorVariant[];
};

type Baseline = {
  title: string;
  description: string;
  price: string;
  compareAt: string;
  cost: string;
  status: EditorProduct["status"];
  collection: string;
  reorder: Record<string, string>;
  shelf: Record<string, string>;
};

function parseMoney(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const num = Number.parseFloat(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : null;
}

function moneyInput(cents: number | null): string {
  return cents == null ? "" : money(cents);
}

function initialBaseline(p: EditorProduct): Baseline {
  return {
    title: p.name,
    description: p.description,
    price: moneyInput(p.priceCents),
    compareAt: moneyInput(p.compareAtCents),
    cost: moneyInput(p.costCents),
    status: p.status,
    collection: p.collection,
    reorder: Object.fromEntries(p.variants.map((v) => [v.sku, String(v.reorderPoint)])),
    shelf: Object.fromEntries(p.variants.map((v) => [v.sku, v.shelf])),
  };
}

const DB_STATUS: Record<EditorProduct["status"], string> = {
  active: "published",
  draft: "draft",
  archived: "archived",
};

export default function ProductEditorClient({
  product,
  collections,
}: {
  product: EditorProduct;
  collections: string[];
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState<Baseline>(() => initialBaseline(product));
  const [values, setValues] = useState<Baseline>(() => initialBaseline(product));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const dirtyCount =
    (values.title !== baseline.title ? 1 : 0) +
    (values.description !== baseline.description ? 1 : 0) +
    (values.price !== baseline.price ? 1 : 0) +
    (values.compareAt !== baseline.compareAt ? 1 : 0) +
    (values.cost !== baseline.cost ? 1 : 0) +
    (values.status !== baseline.status ? 1 : 0) +
    (values.collection !== baseline.collection ? 1 : 0) +
    product.variants.filter(
      (v) => values.reorder[v.sku] !== baseline.reorder[v.sku] || values.shelf[v.sku] !== baseline.shelf[v.sku],
    ).length;
  const dirty = dirtyCount > 0;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function set<K extends keyof Baseline>(key: K, v: Baseline[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSavedFlash(false);
    setError("");
  }
  function discard() {
    setValues({ ...baseline, reorder: { ...baseline.reorder }, shelf: { ...baseline.shelf } });
    setError("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      /* 1 · product fields (collection maps name → category_id in
         the action) */
      if (
        values.title !== baseline.title ||
        values.description !== baseline.description ||
        values.collection !== baseline.collection
      ) {
        const res = await updateProduct(product.id, {
          title: values.title,
          description: values.description,
          collection: values.collection,
        });
        if (!res.ok) return setError(res.reason);
      }
      /* 2 · per-variant uniform price / compare-at / cost + shelf */
      const priceChanged = values.price !== baseline.price;
      const compareChanged = values.compareAt !== baseline.compareAt;
      const costChanged = values.cost !== baseline.cost;
      for (const v of product.variants) {
        const patch: Record<string, unknown> = {};
        if (priceChanged) patch.priceCents = parseMoney(values.price);
        if (compareChanged) {
          /* Sent under both cents spellings; the landed updateVariant
             does not map compare-at yet (log gap 2c) — when W-DATA
             adds the mapping this lights up without a call-site
             change. Until then a compare-at-only save is a no-op at
             the action and the field re-reads its stored value on
             refresh. */
          patch.compareAtCents = parseMoney(values.compareAt);
          patch.compareAtPriceCents = parseMoney(values.compareAt);
        }
        if (costChanged) patch.costCents = parseMoney(values.cost);
        if (values.shelf[v.sku] !== baseline.shelf[v.sku]) patch.shelf = values.shelf[v.sku] ?? "";
        if (Object.keys(patch).length > 0) {
          const res = await updateVariant(v.id, patch);
          if (!res.ok) return setError(`${v.sku}: ${res.reason}`);
        }
        /* 3 · threshold per variant (the RPC) */
        if (values.reorder[v.sku] !== baseline.reorder[v.sku]) {
          const n = Number.parseInt(values.reorder[v.sku] ?? "", 10);
          if (!Number.isFinite(n) || n < 0) return setError(`${v.sku}: reorder point must be a whole number, 0 or more.`);
          const res = await setVariantThreshold(v.id, n);
          if (!res.ok) return setError(`${v.sku}: ${res.reason}`);
        }
      }
      /* 4 · status */
      if (values.status !== baseline.status) {
        const res = await setProductStatus(product.id, DB_STATUS[values.status]);
        if (!res.ok) return setError(res.reason);
      }
      setBaseline({ ...values, reorder: { ...values.reorder }, shelf: { ...values.shelf } });
      setSavedFlash(true);
      router.refresh();
    });
  }

  const priceCents = parseMoney(values.price) ?? 0;
  const costCents = parseMoney(values.cost);
  const marginCents = costCents == null ? null : priceCents - costCents;
  const marginPct = marginCents != null && priceCents > 0 ? Math.round((marginCents / priceCents) * 100) : null;
  const costDirty = values.cost !== baseline.cost;

  const unsavedCls = (changed: boolean) => (changed ? " cc-in-unsaved" : "");
  const statusLabel = values.status === "active" ? "Active" : values.status === "draft" ? "Draft" : "Archived";

  /* Runout estimate from real velocity (sold30d) for the tightest variant. */
  const dailyRate = product.sold30d > 0 ? product.sold30d / 30 : 0;
  const tightest = [...product.variants]
    .map((v) => ({ label: v.label, avail: v.onHand }))
    .filter((v) => v.avail > 0)
    .sort((a, b) => a.avail - b.avail)[0];
  const runoutDays = tightest && dailyRate > 0 ? Math.max(1, Math.round(tightest.avail / dailyRate)) : null;

  return (
    <>
      <section className="cc-task-band">
        <div className="cc-band-stack">
          <Link href="/admin/products" className="cc-backlink">← Products</Link>
          <div className="cc-title-row">
            <h1 className="cc-h1">{values.title || product.name}</h1>
            <Stamp tone={values.status === "active" ? "paid" : "muted"}>{statusLabel}</Stamp>
          </div>
        </div>
        <div className="cc-btnrow">
          {dirty ? (
            <span className="cc-unsaved" role="status"><i aria-hidden="true" />{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
          ) : savedFlash ? (
            <span role="status" style={{ fontSize: 13, color: "var(--paid)", fontWeight: 600 }}>All changes saved</span>
          ) : null}
          <Button onClick={discard} disabled={!dirty || pending}>Discard</Button>
          <Button href={`/products/${product.slug}`}>View in store ↗</Button>
          <Button variant="tape" onClick={save} disabled={!dirty || pending}>Save and publish</Button>
        </div>
      </section>
      {error ? (
        <div className="sr-page" style={{ paddingBottom: 0 }}>
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--problem)", fontWeight: 600 }}>{error}</p>
        </div>
      ) : null}

      <div className="sr-page">
        <div className="sr-cols">
          <form className="sr-col-main" onSubmit={save}>
            {/* Details */}
            <section className="cc-panel" aria-labelledby="dt">
              <div className="cc-ph"><h2 id="dt">Details</h2></div>
              <div className="cc-pb">
                <div className="cc-f">
                  <label htmlFor="t">Title</label>
                  <input id="t" className={`cc-in${unsavedCls(values.title !== baseline.title)}`} value={values.title} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="d">Description</label>
                  <textarea id="d" rows={4} className={`cc-in cc-textarea${unsavedCls(values.description !== baseline.description)}`} value={values.description} onChange={(e) => set("description", e.target.value)} />
                </div>
              </div>
            </section>

            {/* Photos — no image read/upload in the data contract yet
                (adaptation A-PE-6): panel preserved, honest state. */}
            <section className="cc-panel" aria-labelledby="md">
              <div className="cc-ph">
                <h2 id="md">Photos</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>First photo shows in the store grid</span>
              </div>
              <div className="cc-pb">
                <span style={{ fontSize: 13, color: "var(--slate)" }}>
                  Photo upload isn&apos;t enabled yet — photos are managed outside the console for now.
                </span>
              </div>
            </section>

            {/* Price */}
            <section className="cc-panel" aria-labelledby="pr">
              <div className="cc-ph"><h2 id="pr">Price</h2></div>
              <div className="cc-pb cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="p1">Price</label>
                  <input id="p1" className={`cc-in${unsavedCls(values.price !== baseline.price)}`} value={values.price} onChange={(e) => set("price", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="p2">Compare-at price</label>
                  <input id="p2" className={`cc-in${unsavedCls(values.compareAt !== baseline.compareAt)}`} placeholder="Optional" value={values.compareAt} onChange={(e) => set("compareAt", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="p3">Cost per item</label>
                  <input id="p3" className={`cc-in${unsavedCls(costDirty)}`} placeholder="Not entered" value={values.cost} onChange={(e) => set("cost", e.target.value)} aria-describedby={costDirty ? "cost-note" : undefined} />
                  {costDirty && marginCents != null ? (
                    <span id="cost-note" className="cc-field-note-tape">
                      Changed from {baseline.cost || "—"} · margin now {money(marginCents)}, {marginPct}%
                    </span>
                  ) : marginCents != null ? (
                    <span style={{ fontSize: 12, color: "var(--slate)" }}>Margin {money(marginCents)}, {marginPct}%</span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--slate)" }}>Cost not entered — no margin yet</span>
                  )}
                </div>
              </div>
              <p style={{ margin: 0, padding: "0 20px 16px", fontSize: 12, color: "var(--slate)" }}>
                Price, compare-at and cost apply to every variant of this product.
              </p>
            </section>

            {/* Variants */}
            <section className="cc-panel" aria-labelledby="vr">
              <div className="cc-ph">
                <h2 id="vr">Variants · {product.variants.length}</h2>
                <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12, fontWeight: 600 }}>Add option</a>
              </div>
              <div className="cc-pb" style={{ gap: 0 }}>
                <div className="cc-scroll">
                  <div role="table" aria-label="Variants">
                    <div role="row" className="cc-vr cc-vr-head">
                      <span role="columnheader">Variant</span>
                      <span role="columnheader">SKU</span>
                      <span role="columnheader" className="cc-right">On hand</span>
                      <span role="columnheader" className="cc-right">Reorder at</span>
                      <span role="columnheader">Shelf</span>
                    </div>
                    {product.variants.map((v) => {
                      const swatch = colourHex(v.label);
                      const low = v.onHand < v.reorderPoint;
                      const reorderChanged = values.reorder[v.sku] !== baseline.reorder[v.sku];
                      const shelfChanged = values.shelf[v.sku] !== baseline.shelf[v.sku];
                      return (
                        <div role="row" className="cc-vr" key={v.sku}>
                          <span role="cell" className="cc-vr-variant">
                            <i aria-hidden="true" className="cc-vr-swatch" style={{ background: swatch, outline: !isDarkBg(swatch) ? "1px solid var(--control)" : undefined }} />
                            <b style={{ fontWeight: 600 }}>{v.label}</b>
                            {low ? <Stamp tone="tape">Low</Stamp> : null}
                          </span>
                          <span role="cell" className="mono" style={{ fontSize: 12 }}>{v.sku}</span>
                          <span role="cell" className={`cond cc-vr-onhand cc-right${low ? " cc-vr-onhand-warn" : ""}`}>{v.onHand}</span>
                          <span role="cell">
                            <label htmlFor={`r-${v.sku}`} className="cc-visually-hidden">Reorder point for {v.label}</label>
                            <input
                              id={`r-${v.sku}`}
                              className={`cc-in cc-vr-input${unsavedCls(reorderChanged)}`}
                              value={values.reorder[v.sku] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  reorder: { ...prev.reorder, [v.sku]: e.target.value.replace(/[^0-9]/g, "") },
                                }))
                              }
                            />
                          </span>
                          <span role="cell">
                            <label htmlFor={`s-${v.sku}`} className="cc-visually-hidden">Shelf for {v.label}</label>
                            <input
                              id={`s-${v.sku}`}
                              className={`cc-in cc-vr-input${unsavedCls(shelfChanged)}`}
                              style={{ textAlign: "left" }}
                              placeholder="—"
                              value={values.shelf[v.sku] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  shelf: { ...prev.shelf, [v.sku]: e.target.value },
                                }))
                              }
                            />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="cc-onhand-note">On-hand counts change only through orders, deliveries and stock adjustments, so every change has a reason in Inventory.</p>
              </div>
            </section>

            {/* Shipping — no DB columns yet (adaptation A-PE-2). */}
            <section className="cc-panel" aria-labelledby="sh">
              <div className="cc-ph"><h2 id="sh">Shipping</h2></div>
              <div className="cc-pb cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="w">Packed weight</label>
                  <input id="w" className="cc-in" value="" placeholder="Not stored" disabled />
                </div>
                <div className="cc-f">
                  <label htmlFor="bx">Box</label>
                  <select id="bx" className="cc-in" value="" disabled>
                    <option value="">Not stored</option>
                  </select>
                </div>
                <div className="cc-f">
                  <label htmlFor="hs">Customs code</label>
                  <input id="hs" className="cc-in mono" style={{ fontSize: 13 }} value="" placeholder="Not stored" disabled />
                </div>
              </div>
              <p style={{ margin: 0, padding: "0 20px 16px", fontSize: 12, color: "var(--slate)" }}>
                Shipping details aren&apos;t stored yet.
              </p>
            </section>
          </form>

          {/* Side column */}
          <aside className="sr-col-side">
            <section className="cc-panel" aria-labelledby="perf">
              <div className="cc-ph"><h2 id="perf">Last 30 days</h2></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div className="cc-k" style={{ borderTop: 0, borderRight: "1px solid var(--rule)" }}>
                  <span className="cc-k-label">Sold</span>
                  <b className="cc-k-value">{product.sold30d} <span style={{ fontSize: 18 }}>units</span></b>
                </div>
                <div className="cc-k" style={{ borderTop: 0 }}>
                  <span className="cc-k-label">Revenue</span>
                  <b className="cc-k-value">{money(product.sold30d * product.priceCents)}</b>
                </div>
              </div>
              {tightest && runoutDays != null ? (
                <div className="cc-runout">
                  <span>{tightest.label} runs out in</span>
                  <b>about {runoutDays} day{runoutDays === 1 ? "" : "s"}</b>
                </div>
              ) : null}
            </section>

            <section className="cc-panel" aria-labelledby="vis">
              <div className="cc-ph"><h2 id="vis">Storefront</h2></div>
              <div className="cc-pb">
                <label className="cc-ck">
                  <input type="radio" name="st" checked={values.status === "active"} onChange={() => set("status", "active")} />
                  <span><b>Active</b> · visible and for sale</span>
                </label>
                <label className="cc-ck">
                  <input type="radio" name="st" checked={values.status === "draft"} onChange={() => set("status", "draft")} />
                  <span><b>Draft</b> · hidden, keeps stock</span>
                </label>
                <label className="cc-ck">
                  <input type="radio" name="st" checked={values.status === "archived"} onChange={() => set("status", "archived")} />
                  <span><b>Archived</b> · hidden, keeps stock</span>
                </label>
                <label className="cc-ck">
                  <input type="checkbox" checked={product.backorder} disabled />
                  <span>Keep selling a variant when it hits 0 <span style={{ color: "var(--slate)" }}>(back-order)</span></span>
                </label>
                <span className="cc-backorder-note">When off, a variant at 0 shows “Sold out” in the store and can’t be added to a cart.</span>
              </div>
            </section>

            <section className="cc-panel" aria-labelledby="org">
              <div className="cc-ph"><h2 id="org">Organization</h2></div>
              <div className="cc-pb">
                <div className="cc-f">
                  <label htmlFor="cl">Collection</label>
                  <select
                    id="cl"
                    className={`cc-in${unsavedCls(values.collection !== baseline.collection)}`}
                    value={values.collection}
                    onChange={(e) => set("collection", e.target.value)}
                  >
                    {[...new Set([product.collection, ...collections])].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="cc-f">
                  <label htmlFor="vd">Supplier</label>
                  <input id="vd" className="cc-in" value={product.supplier ?? ""} placeholder="No supplier on record" readOnly />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
