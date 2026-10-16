"use client";

/* C-06 Product wizard — exact build of screens/ProductWizard.html, step 2
   of 4 ("Variants and stock") for the Linen tea towel ($22). The option
   builder is live: colour × pattern chips produce the 4 SKUs from the
   pattern TT-<colour>-<pattern>; removing/adding a value rebuilds the
   table. The Charcoal · Stripe row opens with no stock — its field takes
   the unsaved treatment and the missing-stock warning names it. Side:
   "Before you publish" checklist (2 of 4 done) and the Starting value
   ledger panel, both recomputed from the stock actually entered. */

import { useMemo, useState } from "react";
import { Button } from "@/components/sr/Button";
import { TaskBar } from "@/components/sr/TaskBar";
import { Stamp } from "@/components/sr/Stamp";
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

const PRICE_CENTS = 2200;
const COST_CENTS = 710;

export default function ProductWizardPage() {
  const [colours, setColours] = useState<string[]>(["Natural", "Charcoal"]);
  const [patterns, setPatterns] = useState<string[]>(["Plain", "Stripe"]);
  const [colourInput, setColourInput] = useState("");
  const [patternInput, setPatternInput] = useState("");
  const [stock, setStock] = useState<Record<string, string>>({
    "TT-NAT-PL": "40",
    "TT-NAT-ST": "30",
    "TT-CHR-PL": "30",
    "TT-CHR-ST": "",
  });
  const [notice, setNotice] = useState("");

  const variants = useMemo<Variant[]>(
    () =>
      colours.flatMap((colour) =>
        patterns.map((pattern) => {
          const sku = `TT-${skuPart(colour)}-${skuPart(pattern)}`;
          return { colour, pattern, sku, stock: stock[sku] ?? "", reorder: "10" };
        }),
      ),
    [colours, patterns, stock],
  );

  const missing = variants.filter((v) => v.stock.trim() === "");
  const units = variants.reduce((a, v) => a + (Number.parseInt(v.stock, 10) || 0), 0);
  const stockDone = missing.length === 0;

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

  return (
    <>
      <TaskBar
        title="New product"
        closeLabel="Save draft and close"
        closeHref="/admin/products"
      />
      {/* Steps (ProductWizard.html) */}
      <nav aria-label="Steps" className="cc-steps-nav">
        <ol>
          <li className="cc-step-done">
            <span className="cc-step-kicker">1 · Done</span>
            <b className="cc-step-name">Details</b>
          </li>
          <li aria-current="step" className="cc-step-now">
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
              setNotice("Draft saved. Continue to photos when you’re ready.");
            }}
          >
            <div className="cc-band-stack" style={{ gap: 6 }}>
              <h1 className="cc-h1">Linen tea towel</h1>
              <span className="cc-sub">$22.00 · Kitchen textiles · from Baltic Linen Works</span>
            </div>

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
                <span style={{ fontSize: 12, color: "var(--slate)" }}>SKUs follow your pattern TT-<i>colour</i>-<i>pattern</i></span>
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
                        <b role="cell" style={{ fontWeight: 600 }}>{v.colour} · {v.pattern}</b>
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
                            readOnly
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {missing.length > 0 ? (
                <p id="h4" className="cc-wiz-missing">
                  {missing.map((v) => `${v.colour} · ${v.pattern}`).join(", ")} has no stock yet. It can be published as sold out, or removed for now.
                </p>
              ) : null}
            </section>

            <div className="cc-wiz-actions">
              <Button href="/admin/products/new">Back to details</Button>
              <div className="cc-btnrow">
                <Button type="submit">Save draft</Button>
                <Button variant="tape" size="lg" type="submit">Continue to photos</Button>
              </div>
            </div>
            {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}
          </form>

          {/* Side: checklist + starting value (ledger preview) */}
          <aside aria-label="Before you publish" className="sr-col-side">
            <section className="cc-panel">
              <div className="cc-ph">
                <h2>Before you publish</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>{stockDone ? "3" : "2"} of 4 done</span>
              </div>
              <div aria-hidden="true" className="cc-check-segs">
                <i className="cc-seg-done" />
                <i className="cc-seg-done" />
                <i className={stockDone ? "cc-seg-done" : "cc-seg-now"} />
                <i />
              </div>
              <ol className="cc-publish-list">
                <li><span>Title, price and collection</span><Stamp tone="paid">Done</Stamp></li>
                <li><span>Variants and SKUs</span><Stamp tone="paid">Done</Stamp></li>
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
                  <span className="cc-k-label">At cost ($7.10 each)</span>
                  <b className="cc-k-value" style={{ fontSize: 26 }}>{money(units * COST_CENTS)}</b>
                </div>
                <div className="cc-k" style={{ borderTop: 0 }}>
                  <span className="cc-k-label">At retail</span>
                  <b className="cc-k-value" style={{ fontSize: 26 }}>{money(units * PRICE_CENTS)}</b>
                </div>
              </div>
              <p style={{ margin: 0, padding: "12px 20px", borderTop: "1px solid var(--rule)", fontSize: 12, color: "var(--slate)", lineHeight: 1.5 }}>
                Ledger preview: publishing writes {units} units across {variants.length} SKUs to stock, valued at {money(units * COST_CENTS)} at cost.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
