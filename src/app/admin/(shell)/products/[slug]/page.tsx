"use client";

/* C-05 Product editor — exact build of screens/ProductEditor.html for the
   canonical linen-apron. The screen opens with 2 unsaved changes (§10:
   dirty tracking is live): cost $19.80 → $21.40 (margin $42.60, 67%) and
   Rust's reorder point changed. Editing any field updates the header count
   live; changed fields take the Field unsaved treatment (tape border +
   focus-tape ring + "Changed from X · not saved"); beforeunload warns
   while dirty. Variants table carries shelf codes; the on-hand note and
   the back-order toggle + explanation are verbatim. Data:
   @/lib/api getProduct(slug), normalised to the canon product. */

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { getProduct } from "@/lib/api";
import { money } from "@/lib/format";
import "@/styles/console-core.css";

type AnyRec = Record<string, unknown>;
const rec = (v: unknown): AnyRec => (v && typeof v === "object" ? (v as AnyRec) : {});
const s = (v: unknown, f: string): string => (typeof v === "string" && v.length > 0 ? v : f);

/* Original (saved) values — the screen's "changed from" references. */
const SAVED = {
  title: "Linen apron",
  description:
    "Heavyweight stonewashed linen with a cross-back strap and two deep front pockets. Softens with every wash. Made in Lithuania; sewn in Philadelphia.",
  price: "$64.00",
  compareAt: "",
  cost: "$19.80",
  weight: "0.6 lb",
  box: "Mailer, small",
  customs: "6211.43",
  supplier: "Baltic Linen Works",
  reorderCHR: "12",
  reorderNAT: "12",
  reorderRST: "8",
};
/* The screen's opening state: cost already edited to $21.40 and Rust's
   reorder point already edited 8 → 6 (the 2 unsaved changes). */
const OPENING = { ...SAVED, cost: "$21.40", reorderRST: "6" };

type FieldKey = keyof typeof SAVED;

const VARIANTS = [
  { name: "Charcoal", sku: "LA-CHR", swatch: "#3A3530", onHand: 3, low: true, shelf: "A-03", reorderKey: "reorderCHR" as FieldKey },
  { name: "Natural", sku: "LA-NAT", swatch: "#D9D0C1", outline: true, onHand: 14, low: false, shelf: "A-03", reorderKey: "reorderNAT" as FieldKey },
  { name: "Rust", sku: "LA-RST", swatch: "#9A4E2E", onHand: 9, low: false, shelf: "A-04", reorderKey: "reorderRST" as FieldKey },
];

const PHOTOS = [
  { label: "Photo 1, Charcoal apron front", bg: "#3A3530", color: "#D6D3CE", text: "Front · Charcoal" },
  { label: "Photo 2, Natural apron", bg: "#D9D0C1", color: "#44403C", text: "Natural" },
  { label: "Photo 3, Rust apron", bg: "#9A4E2E", color: "#F5F3F0", text: "Rust" },
  { label: "Photo 4, pocket detail", bg: "#57534E", color: "#F5F3F0", text: "Pocket detail" },
];

export default function ProductEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={null}>
      <EditorInner params={params} />
    </Suspense>
  );
}

function parseMoney(v: string): number {
  const num = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function EditorInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const product = useMemo(() => rec(getProduct("linen-apron")), []);
  const name = s(product.name ?? product.title, "Linen apron");

  const [values, setValues] = useState<Record<FieldKey, string>>({ ...OPENING });
  const [status, setStatus] = useState<"active" | "draft">("active");
  const [backorder, setBackorder] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirtyKeys = (Object.keys(SAVED) as FieldKey[]).filter((k) => values[k] !== SAVED[k]);
  const dirty = dirtyKeys.length;

  /* §10: warn before leaving with unsaved changes. */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function set(key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSavedFlash(false);
  }
  function discard() {
    setValues({ ...SAVED });
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    /* The demo has no backend: saving commits the local baseline so the
       unsaved count clears, exactly as the header promises. */
    (Object.keys(SAVED) as FieldKey[]).forEach((k) => {
      SAVED[k] = values[k];
    });
    setValues({ ...values });
    setSavedFlash(true);
  }

  const priceCents = parseMoney(values.price);
  const costCents = parseMoney(values.cost);
  const marginCents = priceCents - costCents;
  const marginPct = priceCents > 0 ? Math.round((marginCents / priceCents) * 100) : 0;
  const costDirty = values.cost !== SAVED.cost;

  const unsavedCls = (key: FieldKey) => (values[key] !== SAVED[key] ? " cc-in-unsaved" : "");

  return (
    <>
      <section className="cc-task-band">
        <div className="cc-band-stack">
          <Link href="/admin/products" className="cc-backlink">← Products</Link>
          <div className="cc-title-row">
            <h1 className="cc-h1">{name}</h1>
            <Stamp tone="paid">Active</Stamp>
          </div>
          {slug !== "linen-apron" ? (
            <span className="cc-sub">Showing the canonical editor (linen-apron) for “{slug}”.</span>
          ) : null}
        </div>
        <div className="cc-btnrow">
          {dirty > 0 ? (
            <span className="cc-unsaved" role="status"><i aria-hidden="true" />{dirty} unsaved change{dirty === 1 ? "" : "s"}</span>
          ) : savedFlash ? (
            <span role="status" style={{ fontSize: 13, color: "var(--paid)", fontWeight: 600 }}>All changes saved</span>
          ) : null}
          <Button onClick={discard} disabled={dirty === 0}>Discard</Button>
          <Button href="/products/linen-apron">View in store ↗</Button>
          <Button variant="tape" onClick={save} disabled={dirty === 0}>Save and publish</Button>
        </div>
      </section>

      <div className="sr-page">
        <div className="sr-cols">
          <form className="sr-col-main" onSubmit={save}>
            {/* Details */}
            <section className="cc-panel" aria-labelledby="dt">
              <div className="cc-ph"><h2 id="dt">Details</h2></div>
              <div className="cc-pb">
                <div className="cc-f">
                  <label htmlFor="t">Title</label>
                  <input id="t" className={`cc-in${unsavedCls("title")}`} value={values.title} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="d">Description</label>
                  <textarea id="d" rows={4} className={`cc-in cc-textarea${unsavedCls("description")}`} value={values.description} onChange={(e) => set("description", e.target.value)} />
                </div>
              </div>
            </section>

            {/* Photos */}
            <section className="cc-panel" aria-labelledby="md">
              <div className="cc-ph">
                <h2 id="md">Photos · 4</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>First photo shows in the store grid</span>
              </div>
              <div className="cc-pb cc-photos">
                {PHOTOS.map((p) => (
                  <div key={p.label} role="img" aria-label={p.label} className="cc-photo" style={{ background: p.bg, color: p.color }}>
                    {p.text}
                  </div>
                ))}
                <label htmlFor="up" className="cc-photo-add">
                  Add photos
                  <input id="up" type="file" multiple className="cc-visually-hidden" style={{ position: "absolute", opacity: 0 }} />
                </label>
              </div>
            </section>

            {/* Price */}
            <section className="cc-panel" aria-labelledby="pr">
              <div className="cc-ph"><h2 id="pr">Price</h2></div>
              <div className="cc-pb cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="p1">Price</label>
                  <input id="p1" className={`cc-in${unsavedCls("price")}`} value={values.price} onChange={(e) => set("price", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="p2">Compare-at price</label>
                  <input id="p2" className={`cc-in${unsavedCls("compareAt")}`} placeholder="Optional" value={values.compareAt} onChange={(e) => set("compareAt", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="p3">Cost per item</label>
                  <input id="p3" className={`cc-in${unsavedCls("cost")}`} value={values.cost} onChange={(e) => set("cost", e.target.value)} aria-describedby={costDirty ? "cost-note" : undefined} />
                  {costDirty ? (
                    <span id="cost-note" className="cc-field-note-tape">
                      Changed from {SAVED.cost} · margin now {money(marginCents)}, {marginPct}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--slate)" }}>Margin {money(marginCents)}, {marginPct}%</span>
                  )}
                </div>
              </div>
            </section>

            {/* Variants */}
            <section className="cc-panel" aria-labelledby="vr">
              <div className="cc-ph">
                <h2 id="vr">Variants · Colour</h2>
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
                    {VARIANTS.map((v) => (
                      <div role="row" className="cc-vr" key={v.sku}>
                        <span role="cell" className="cc-vr-variant">
                          <i aria-hidden="true" className="cc-vr-swatch" style={{ background: v.swatch, outline: v.outline ? "1px solid var(--control)" : undefined }} />
                          <b style={{ fontWeight: 600 }}>{v.name}</b>
                          {v.low ? <Stamp tone="tape">Low</Stamp> : null}
                        </span>
                        <span role="cell" className="mono" style={{ fontSize: 12 }}>{v.sku}</span>
                        <span role="cell" className={`cond cc-vr-onhand cc-right${v.low ? " cc-vr-onhand-warn" : ""}`}>{v.onHand}</span>
                        <span role="cell">
                          <label htmlFor={`r-${v.sku}`} className="cc-visually-hidden">Reorder point for {v.name}</label>
                          <input
                            id={`r-${v.sku}`}
                            className={`cc-in cc-vr-input${unsavedCls(v.reorderKey)}`}
                            value={values[v.reorderKey]}
                            onChange={(e) => set(v.reorderKey, e.target.value.replace(/[^0-9]/g, ""))}
                          />
                        </span>
                        <span role="cell" className="mono" style={{ fontSize: 12 }}>{v.shelf}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="cc-onhand-note">On-hand counts change only through orders, deliveries and stock adjustments, so every change has a reason in Inventory.</p>
              </div>
            </section>

            {/* Shipping */}
            <section className="cc-panel" aria-labelledby="sh">
              <div className="cc-ph"><h2 id="sh">Shipping</h2></div>
              <div className="cc-pb cc-grid3" style={{ display: "grid" }}>
                <div className="cc-f">
                  <label htmlFor="w">Packed weight</label>
                  <input id="w" className={`cc-in${unsavedCls("weight")}`} value={values.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
                <div className="cc-f">
                  <label htmlFor="bx">Box</label>
                  <select id="bx" className={`cc-in${unsavedCls("box")}`} value={values.box} onChange={(e) => set("box", e.target.value)}>
                    <option>Mailer, small</option>
                    <option>Box, medium</option>
                  </select>
                </div>
                <div className="cc-f">
                  <label htmlFor="hs">Customs code</label>
                  <input id="hs" className={`cc-in mono${unsavedCls("customs")}`} style={{ fontSize: 13 }} value={values.customs} onChange={(e) => set("customs", e.target.value)} />
                </div>
              </div>
            </section>
          </form>

          {/* Side column */}
          <aside className="sr-col-side">
            <section className="cc-panel" aria-labelledby="perf">
              <div className="cc-ph"><h2 id="perf">Last 30 days</h2></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div className="cc-k" style={{ borderTop: 0, borderRight: "1px solid var(--rule)" }}>
                  <span className="cc-k-label">Sold</span>
                  <b className="cc-k-value">38 <span style={{ fontSize: 18 }}>units</span></b>
                </div>
                <div className="cc-k" style={{ borderTop: 0 }}>
                  <span className="cc-k-label">Revenue</span>
                  <b className="cc-k-value">$2,432.00</b>
                </div>
              </div>
              <div className="cc-runout">
                <span>Charcoal runs out in</span>
                <b>about 5 days</b>
              </div>
            </section>

            <section className="cc-panel" aria-labelledby="vis">
              <div className="cc-ph"><h2 id="vis">Storefront</h2></div>
              <div className="cc-pb">
                <label className="cc-ck">
                  <input type="radio" name="st" checked={status === "active"} onChange={() => setStatus("active")} />
                  <span><b>Active</b> · visible and for sale</span>
                </label>
                <label className="cc-ck">
                  <input type="radio" name="st" checked={status === "draft"} onChange={() => setStatus("draft")} />
                  <span><b>Draft</b> · hidden, keeps stock</span>
                </label>
                <label className="cc-ck">
                  <input type="checkbox" checked={backorder} onChange={(e) => setBackorder(e.target.checked)} />
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
                  <select id="cl" className="cc-in" defaultValue="Kitchen textiles">
                    <option>Kitchen textiles</option>
                    <option>Tableware</option>
                    <option>Home</option>
                  </select>
                </div>
                <div className="cc-f">
                  <label htmlFor="vd">Supplier</label>
                  <input id="vd" className={`cc-in${unsavedCls("supplier")}`} value={values.supplier} onChange={(e) => set("supplier", e.target.value)} />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
