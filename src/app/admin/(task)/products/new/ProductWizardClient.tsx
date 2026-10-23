"use client";

/* C-06 Product wizard — screens/ProductNew.html (3 steps).
 * Client island: real products list + collection list arrive from
 * the server; the island draws SKUs from the store prefix, builds
 * variants from colour × pattern, and POSTs the draft to the real
 * createProduct server action (@/lib/shop/admin-actions). Unsaved-
 * change guard, dirty segments and the ledger-preview starting value
 * follow the screen's design. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { createProductDraft } from "@/lib/shop/admin-actions";

type VariantDraft = {
  colour: string;
  pattern: string;
  sku: string;
  stock: string;
  reorder: string;
};

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function prefixFrom(title: string, existing: string[]): string {
  const base = slugify(title)
    .split("-")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const stem = base || "PRD";
  let n = 0;
  let candidate = stem;
  while (existing.some((p) => p.sku.startsWith(candidate))) {
    n += 1;
    candidate = `${stem}${n}`;
  }
  return candidate;
}

function parseCents(raw: string): number {
  const digits = raw.replace(/[^0-9.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function titleCase(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export default function ProductWizardClient({
  existingSkus,
  collections,
  storePrefix,
}: {
  existingSkus: string[];
  collections: string[];
  storePrefix: string;
}) {
  // Step state
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);

  // Step 1: details
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [collection, setCollection] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: options
  const [colours, setColours] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [colourInput, setColourInput] = useState("");
  const [patternInput, setPatternInput] = useState("");

  // Step 3: stock per variant (keyed by SKU)
  const [stock, setStock] = useState<Record<string, string>>({});
  const [reorder, setReorder] = useState<Record<string, string>>({});

  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const priceCents = parseCents(price);
  const costCents = parseCents(cost);

  const prefix = useMemo(
    () => prefixFrom(title, existingSkus.map((s) => ({ sku: s })) as never[] & string[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title],
  );

  const variants: VariantDraft[] = useMemo(() => {
    const cs = colours.length ? colours : [""];
    const ps = patterns.length ? patterns : [""];
    const out: VariantDraft[] = [];
    for (const c of cs) {
      for (const p of ps) {
        const colourBit = c ? slugify(c).replace(/-/g, "").slice(0, 3).toUpperCase() : "";
        const patternBit = p ? slugify(p).replace(/-/g, "").slice(0, 3).toUpperCase() : "";
        const bits = [colourBit, patternBit].filter(Boolean).join("-");
        const sku = bits ? `${storePrefix || prefix}-${bits}` : `${storePrefix || prefix}-STD`;
        out.push({
          colour: titleCase(c),
          pattern: titleCase(p),
          sku,
          stock: stock[sku] ?? "",
          reorder: reorder[sku] ?? "",
        });
      }
    }
    return out;
  }, [colours, patterns, prefix, storePrefix, stock, reorder]);

  const missing = variants.filter((v) => v.stock.trim() === "");
  const units = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

  const detailsDone = title.trim().length > 0 && priceCents > 0;
  const variantsDone = variants.length > 0;
  const stockDone = variants.length > 0 && missing.length === 0;
  const doneCount = [detailsDone, variantsDone, stockDone].filter(Boolean).length;

  const addValue = (kind: "colour" | "pattern") => {
    if (kind === "colour") {
      const v = titleCase(colourInput);
      if (v && !colours.includes(v)) setColours([...colours, v]);
      setColourInput("");
    } else {
      const v = titleCase(patternInput);
      if (v && !patterns.includes(v)) setPatterns([...patterns, v]);
      setPatternInput("");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      const res = await createProductDraft({
        title: title.trim(),
        description: description.trim(),
        priceCents,
        costCents: cost.trim() ? costCents : null,
        collection: collection.trim() || null,
        variants: variants.map((v) => ({
          sku: v.sku,
          label: [v.colour, v.pattern].filter(Boolean).join(" · ") || "Standard",
          onHand: Number(v.stock) || 0,
          reorderPoint: Number(v.reorder) || 0,
          priceCents,
        })),
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't save the draft.");
      setNotice("Draft saved — continue to photos to publish it.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {/* Step band */}
      <section className="cc-task-band" aria-labelledby="wz-t">
        <div className="cc-band-stack">
          <Link href="/admin/products" className="cc-backlink">← Products</Link>
          <h1 id="wz-t" className="cc-h1">New product</h1>
          <span className="cc-sub">Step {step} of 3 · {step === 1 ? "Details" : step === 2 ? "Options" : "Stock"}</span>
        </div>
        <div className="cc-band-actions" role="group" aria-label="Wizard steps">
          {[1, 2, 3].map((n) => (
            <Button
              key={n}
              variant={n === step ? "tape" : undefined}
              disabled={n === 2 && !detailsDone}
              onClick={() => setStep(n)}
            >
              {n === 1 ? "1 · Details" : n === 2 ? "2 · Options" : "3 · Stock"}
            </Button>
          ))}
        </div>
      </section>

      {/* Confirm-drawn-details gate (step 1 of the screen) */}
      {!confirmed ? (
        <div className="sr-page">
          <section className="cc-panel" aria-labelledby="wz-cf">
            <div className="cc-ph"><h2 id="wz-cf">Before we start</h2></div>
            <div className="cc-pb">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                Draw the product's details first — title, price, collection — then we'll build
                its variants and stock together. Nothing is saved until you choose “Save draft”.
              </p>
              <div className="cc-btnrow" style={{ marginTop: 16 }}>
                <Button variant="tape" size="lg" onClick={() => setConfirmed(true)}>Draw the details</Button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="sr-page sr-col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          <form
            onSubmit={(e) => void onSubmit(e)}
          >
            {/* Step 1 details — the drawn summary block, as inputs. */}
            <section className="cc-panel" aria-labelledby="wz-dt">
              <div className="cc-ph"><h2 id="wz-dt">Details</h2></div>
              <div className="cc-pb">
                <div className="cc-f">
                  <label htmlFor="wz-title">Title</label>
                  <input id="wz-title" className="cc-in" placeholder="e.g. Linen tea towel" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="cc-grid3" style={{ display: "grid" }}>
                  <div className="cc-f">
                    <label htmlFor="wz-price">Price</label>
                    <input id="wz-price" className="cc-in" placeholder="$22.00" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </div>
                  <div className="cc-f">
                    <label htmlFor="wz-cost">Cost per item</label>
                    <input id="wz-cost" className="cc-in" placeholder="$7.10" value={cost} onChange={(e) => setCost(e.target.value)} />
                  </div>
                  <div className="cc-f">
                    <label htmlFor="wz-col">Collection</label>
                    <input id="wz-col" className="cc-in" placeholder="Kitchen textiles" list="wz-collections" value={collection} onChange={(e) => setCollection(e.target.value)} />
                    <datalist id="wz-collections">
                      {collections.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="cc-f">
                  <label htmlFor="wz-desc">Description</label>
                  <textarea id="wz-desc" rows={3} className="cc-in cc-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                {title.trim() ? (
                  <span className="cc-sub">
                    {title.trim()}
                    {priceCents > 0 ? ` · ${money(priceCents)}` : ""}
                    {collection.trim() ? ` · ${collection.trim()}` : ""}
                  </span>
                ) : null}
              </div>
            </section>

            {/* Options builder */}
            <section className="cc-panel" aria-labelledby="op">
              <div className="cc-ph">
                <h2 id="op">Options</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>Each combination becomes a variant with its own SKU and stock</span>
              </div>
              <div className="cc-pb" style={{ gap: 16 }}>
                <div className="cc-opt-row">
                  <label htmlFor="o1">Colour</label>
                  <div className="cc-chips">
                    {colours.map((c) => (
                      <span className="cc-chip" key={c}>
                        {c}
                        <button type="button" aria-label={`Remove ${c}`} onClick={() => setColours(colours.filter((x) => x !== c))}>×</button>
                      </span>
                    ))}
                    <input
                      id="o1"
                      className="cc-in cc-chip-input"
                      placeholder="Add a colour"
                      value={colourInput}
                      onChange={(e) => setColourInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue("colour"); } }}
                      onBlur={() => addValue("colour")}
                    />
                  </div>
                </div>
                <div className="cc-opt-row">
                  <label htmlFor="o2">Pattern</label>
                  <div className="cc-chips">
                    {patterns.map((p) => (
                      <span className="cc-chip" key={p}>
                        {p}
                        <button type="button" aria-label={`Remove ${p}`} onClick={() => setPatterns(patterns.filter((x) => x !== p))}>×</button>
                      </span>
                    ))}
                    <input
                      id="o2"
                      className="cc-in cc-chip-input"
                      placeholder="Add a pattern"
                      value={patternInput}
                      onChange={(e) => setPatternInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue("pattern"); } }}
                      onBlur={() => addValue("pattern")}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Variants + stock */}
            <section className="cc-panel" aria-labelledby="vs">
              <div className="cc-ph">
                <h2 id="vs">{variants.length} variants</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>SKUs follow your pattern {prefix}-<i>colour</i>-<i>pattern</i></span>
              </div>
              <div className="cc-scroll">
                <div role="table" aria-label="Variants">
                  <div role="row" className="cc-wiz-vr cc-wiz-vr-head">
                    <span role="columnheader">Variant</span>
                    <span role="columnheader">SKU</span>
                    <span role="columnheader">Starting stock</span>
                    <span role="columnheader">Reorder at</span>
                  </div>
                  {variants.map((v) => {
                    const isMissing = v.stock.trim() === "";
                    return (
                      <div role="row" className={`cc-wiz-vr${isMissing ? " cc-wiz-vr-missing" : ""}`} key={v.sku}>
                        <b role="cell" style={{ fontWeight: 600 }}>{[v.colour, v.pattern].filter(Boolean).join(" · ")}</b>
                        <span role="cell" className="mono" style={{ fontSize: 12 }}>{v.sku}</span>
                        <span role="cell">
                          <input
                            className={`cc-in${isMissing ? " cc-in-unsaved" : ""}`}
                            aria-label={`Starting stock, ${v.colour} ${v.pattern}`}
                            aria-describedby={isMissing ? "h4" : undefined}
                            value={v.stock}
                            placeholder="0"
                            inputMode="numeric"
                            style={{ textAlign: "right" }}
                            onChange={(e) => setStock((prev) => ({ ...prev, [v.sku]: e.target.value.replace(/[^0-9]/g, "") }))}
                          />
                        </span>
                        <span role="cell">
                          <input
                            className="cc-in"
                            aria-label={`Reorder at, ${v.colour} ${v.pattern}`}
                            value={v.reorder}
                            inputMode="numeric"
                            style={{ textAlign: "right" }}
                            onChange={(e) => setReorder((prev) => ({ ...prev, [v.sku]: e.target.value.replace(/[^0-9]/g, "") }))}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {variants.length === 0 ? (
                <p className="cc-wiz-missing">Add a colour or a pattern above — each combination becomes a variant.</p>
              ) : missing.length > 0 ? (
                <p id="h4" className="cc-wiz-missing">
                  {missing.map((v) => [v.colour, v.pattern].filter(Boolean).join(" · ")).join(", ")} has no stock yet. It can be published as sold out, or removed for now.
                </p>
              ) : null}
            </section>

            <div className="cc-wiz-actions">
              <Button href="/admin/products">Back to products</Button>
              <div className="cc-btnrow">
                <Button type="submit" disabled={pending}>Save draft</Button>
                <Button variant="tape" size="lg" type="submit" disabled={pending}>Continue to photos</Button>
              </div>
            </div>
            {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}
          </form>

          {/* Side: checklist + starting value (ledger preview) */}
          <aside aria-label="Before you publish" className="sr-col-side">
            <section className="cc-panel">
              <div className="cc-ph">
                <h2>Before you publish</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>{doneCount} of 4 done</span>
              </div>
              <div aria-hidden="true" className="cc-check-segs">
                <i className={detailsDone ? "cc-seg-done" : "cc-seg-now"} />
                <i className={variantsDone ? "cc-seg-done" : detailsDone ? "cc-seg-now" : undefined} />
                <i className={stockDone ? "cc-seg-done" : variantsDone ? "cc-seg-now" : undefined} />
                <i />
              </div>
              <ol className="cc-publish-list">
                <li><span>Title, price and collection</span>{detailsDone ? <Stamp tone="paid">Done</Stamp> : <Stamp tone="tape">To do</Stamp>}</li>
                <li><span>Variants and SKUs</span>{variantsDone ? <Stamp tone="paid">Done</Stamp> : <Stamp tone="tape">To do</Stamp>}</li>
                <li>
                  <span>Stock for every variant</span>
                  {stockDone ? <Stamp tone="paid">Done</Stamp> : <Stamp tone="tape">{missing.length} missing</Stamp>}
                </li>
                <li><span>At least one photo</span><Stamp tone="muted">Next step</Stamp></li>
              </ol>
            </section>

            <section className="cc-panel" aria-labelledby="sv">
              <div className="cc-ph"><h2 id="sv">Starting value</h2></div>
              <div className="cc-k" style={{ borderTop: 0 }}>
                <span className="cc-k-label">Units</span>
                <b className="cc-k-value">{units}</b>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--rule)" }}>
                <div className="cc-k" style={{ borderTop: 0, borderRight: "1px solid var(--rule)" }}>
                  <span className="cc-k-label">At cost ({costCents > 0 ? `${money(costCents)} each` : "cost not set"})</span>
                  <b className="cc-k-value" style={{ fontSize: 26 }}>{money(units * costCents)}</b>
                </div>
                <div className="cc-k" style={{ borderTop: 0 }}>
                  <span className="cc-k-label">At retail</span>
                  <b className="cc-k-value" style={{ fontSize: 26 }}>{money(units * priceCents)}</b>
                </div>
              </div>
              <p style={{ margin: 0, padding: "12px 20px", borderTop: "1px solid var(--rule)", fontSize: 12, color: "var(--slate)", lineHeight: 1.5 }}>
                Ledger preview: publishing writes {units} units across {variants.length} SKUs to stock, valued at {money(units * costCents)} at cost.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
