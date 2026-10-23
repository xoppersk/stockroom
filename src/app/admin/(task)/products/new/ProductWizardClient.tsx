"use client";

/* C-06 Product wizard client island — layout preserved from the
   fixture build (screens/ProductWizard.html, step 2 of 4 "Variants
   and stock"); the option builder is live: colour × pattern chips
   produce SKUs from the pattern <prefix>-<colour>-<pattern>.
 *
 * Real build (adaptations A-WIZ-1..3 in the W-CATALOG log): the
 * wizard opens BLANK — title / price / cost / collection are entered
 * in the header block (the drawn step-1 summary); Save draft and
 * Continue both call the real createProduct action (status draft —
 * inventory_levels auto-create via the DB trigger). Continue lands
 * on the new product's editor, where photos live. Action rejections
 * surface in the notice line. */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import {
  adjustStock,
  createProduct,
  setVariantThreshold,
} from "@/lib/shop/admin-actions";
import { money } from "@/lib/format";
import "@/styles/console-core.css";

type Variant = { colour: string; pattern: string; sku: string; stock: string; reorder: string };

const SKU_PART: Record<string, string> = {
  Natural: "NAT",
  Charcoal: "CHR",
  Plain: "PL",
  Stripe: "ST",
};
function skuPart(v: string): string {
  return SKU_PART[v] ?? v.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

function skuPrefix(title: string): string {
  const words = title.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return "PR";
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMoneyInput(v: string): number | null {
  const num = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 100) : null;
}

export default function ProductWizardClient({ collections }: { collections: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [collection, setCollection] = useState("");
  const [description, setDescription] = useState("");
  const [colours, setColours] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [colourInput, setColourInput] = useState("");
  const [patternInput, setPatternInput] = useState("");
  const [stock, setStock] = useState<Record<string, string>>({});
  const [reorder, setReorder] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const prefix = skuPrefix(title);
  const variants = useMemo<Variant[]>(() => {
    const cols = colours.length ? colours : [""];
    const pats = patterns.length ? patterns : [""];
    if (!colours.length && !patterns.length) return [];
    return cols.flatMap((colour) =>
      pats.map((pattern) => {
        const parts = [prefix, colour && skuPart(colour), pattern && skuPart(pattern)].filter(Boolean);
        const sku = parts.join("-");
        return { colour, pattern, sku, stock: stock[sku] ?? "", reorder: reorder[sku] ?? "10" };
      }),
    );
  }, [colours, patterns, stock, reorder, prefix]);

  const missing = variants.filter((v) => v.stock.trim() === "");
  const units = variants.reduce((a, v) => a + (Number.parseInt(v.stock, 10) || 0), 0);
  const priceCents = parseMoneyInput(price) ?? 0;
  const costCents = parseMoneyInput(cost) ?? 0;
  const detailsDone = title.trim().length > 0 && priceCents > 0 && collection.trim().length > 0;
  const variantsDone = variants.length > 0;
  const stockDone = variantsDone && missing.length === 0;
  const doneCount = (detailsDone ? 1 : 0) + (variantsDone ? 1 : 0) + (stockDone ? 1 : 0);

  function addValue(kind: "colour" | "pattern") {
    const raw = (kind === "colour" ? colourInput : patternInput).trim();
    if (!raw) return;
    const value = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (kind === "colour") {
      if (!colours.includes(value)) setColours([...colours, value]);
      setColourInput("");
    } else {
      if (!patterns.includes(value)) setPatterns([...patterns, value]);
      setPatternInput("");
    }
  }

  function submit() {
    if (!detailsDone) {
      setNotice("Give the product a title, a price and a collection first.");
      return;
    }
    if (!variantsDone) {
      setNotice("Add at least one colour or pattern — every product needs a variant with its own SKU.");
      return;
    }
    const slug = slugify(title);
    const payload = {
      title: title.trim(),
      slug,
      description: description.trim(),
      collection: collection.trim(),
      status: "draft" as const,
      variants: variants.map((v) => ({
        title: [v.colour, v.pattern].filter(Boolean).join(" · ") || "Default",
        sku: v.sku,
        option_values: {
          ...(v.colour ? { Color: v.colour } : {}),
          ...(v.pattern ? { Pattern: v.pattern } : {}),
        },
        priceCents,
        compareAtCents: null,
        costCents: costCents || null,
        shelf: "",
        quantity: Number.parseInt(v.stock, 10) || 0,
        threshold: Number.parseInt(v.reorder, 10) || 10,
      })),
    };
    setNotice("");
    startTransition(async () => {
      const res = await createProduct(payload);
      if (!res.ok) {
        setNotice(res.reason);
        return;
      }
      /* createProduct (as landed) creates the product + variants but
         does not apply starting stock or per-variant thresholds —
         inventory_levels auto-create at 0 / threshold 10 via the DB
         trigger. Land both here through the real actions (they
         resolve SKU codes), so the wizard's numbers are true.
         Failures are named, not hidden (log gap 2b). */
      const failures: string[] = [];
      for (const v of payload.variants) {
        if (v.quantity > 0) {
          const r = await adjustStock(v.sku, v.quantity, "restock_received", "Opening stock.");
          if (!r.ok) failures.push(`${v.sku} stock: ${r.reason}`);
        }
        if (v.threshold !== 10) {
          const r = await setVariantThreshold(v.sku, v.threshold);
          if (!r.ok) failures.push(`${v.sku} reorder point: ${r.reason}`);
        }
      }
      if (failures.length > 0) {
        setNotice(
          `Draft created, but some starting figures didn't land — ${failures.join(" · ")} Fix them from the product editor or Inventory.`,
        );
        return;
      }
      router.push(`/admin/products/${slug}`);
      router.refresh();
    });
  }

  return (
    <>
      {/* Steps (ProductWizard.html) */}
      <nav aria-label="Steps" className="cc-steps-nav">
        <ol>
          <li className={detailsDone ? "cc-step-done" : "cc-step-now"}>
            <span className="cc-step-kicker">{detailsDone ? "1 · Done" : "1 · Now"}</span>
            <b className="cc-step-name">Details</b>
          </li>
          <li aria-current="step" className={detailsDone ? "cc-step-now" : "cc-step-todo"}>
            <span className="cc-step-kicker">2 · Now</span>
            <b className="cc-step-name">Variants and stock</b>
          </li>
          <li className="cc-step-todo">
            <span className="cc-step-kicker">3</span>
            <b className="cc-step-name">Photos</b>
          </li>
          <li className="cc-step-todo">
            <span className="cc-step-kicker">4</span>
            <b className="cc-step-name">Publish</b>
          </li>
        </ol>
      </nav>

      <div className="sr-page">
        <div className="sr-cols">
          <form
            className="sr-col-main"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
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
