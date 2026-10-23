"use client";

/* C-04 Products client island — markup preserved from the fixture
   build (screens/Products.html + X-05 empty catalog); rows, tab
   counts, collections and totals arrive as props from the server
   page, derived from the real catalog. Status tabs live in the URL
   query (?tab=); collection/sort/search are labelled controls.
   Stock-by-variant cells: one segment per variant — green at/above
   reorder, amber below, outlined red at zero. */

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import "@/styles/console-core.css";

export type ProductRowVariant = {
  label: string;
  sku: string;
  available: number;
  reorderPoint: number;
  countPending?: boolean;
};

export type ProductRow = {
  slug: string;
  initials: string;
  thumbBg: string;
  thumbColor: string;
  name: string;
  collection: string;
  meta: string;
  statusLabel: string;
  statusTone: StampTone;
  statusKey: string; // active | draft | archived
  needsRestock: boolean;
  variants: ProductRowVariant[];
  priceLabel: string;
  priceCents: number;
  sold: number | null;
  storefront: string;
  mutedRow?: boolean;
};

export type ProductTab = { key: string; label: string; count: number; countCls?: string };

type Props = {
  rows: ProductRow[];
  tabs: ProductTab[];
  collections: string[];
  totals: { products: number; skus: number; belowReorder: number; soldOut: number };
};

export default function ProductsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <ProductsInner {...props} />
    </Suspense>
  );
}

function segOf(v: ProductRowVariant): "ok" | "low" | "out" {
  if (v.available <= 0) return "out";
  if (v.available < v.reorderPoint) return "low";
  return "ok";
}

function stockText(r: ProductRow): React.ReactNode {
  if (r.variants.length === 0) {
    return <span style={{ color: "var(--slate)" }}>Stock not entered</span>;
  }
  if (r.variants.length === 1) {
    const v = r.variants[0]!;
    const seg = segOf(v);
    const main =
      seg === "out" ? (
        <b className="cc-stock-bad">{v.available} on hand</b>
      ) : seg === "low" ? (
        <b className="cc-stock-warn">{v.available} on hand</b>
      ) : (
        <>{v.available} on hand</>
      );
    return (
      <>
        {main} · reorder at {v.reorderPoint}
        {v.countPending ? " · count pending" : ""}
      </>
    );
  }
  return (
    <>
      {r.variants.map((v, i) => {
        const seg = segOf(v);
        const label = `${v.label} ${v.available}`;
        return (
          <span key={v.sku}>
            {i > 0 ? " · " : ""}
            {seg === "out" ? (
              <b className="cc-stock-bad">{label}</b>
            ) : seg === "low" ? (
              <b className="cc-stock-warn">{label}</b>
            ) : (
              label
            )}
          </span>
        );
      })}
    </>
  );
}

function ProductsInner({ rows, tabs, collections, totals }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") ?? "all";
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [sort, setSort] = useState("sold");

  const visible = rows.filter((r) => {
    if (tab === "active" && r.statusKey !== "active") return false;
    if (tab === "draft" && r.statusKey !== "draft") return false;
    if (tab === "archived" && r.statusKey !== "archived") return false;
    if (tab === "restock" && !r.needsRestock) return false;
    if (collection !== "all" && r.collection !== collection) return false;
    if (query && !`${r.name} ${r.meta} ${r.variants.map((v) => v.sku).join(" ")}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const sorted = [...visible].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "stock") {
      const minAvail = (r: ProductRow) =>
        r.variants.length ? Math.min(...r.variants.map((v) => v.available)) : 0;
      return minAvail(a) - minAvail(b);
    }
    return (b.sold ?? -1) - (a.sold ?? -1);
  });

  function setTab(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "all") next.delete("tab");
    else next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (params.get("state") === "empty" || rows.length === 0) return <EmptyCatalog />;

  return (
    <>
      {/* Summary band + tabs (Products.html) */}
      <section className="cc-band cc-band-tabs">
        <div className="cc-prod-band-grid">
          <div className="cc-band-stack">
            <h1 className="cc-h1">Products</h1>
            <span className="cc-sub">
              {totals.products} products, {totals.skus} SKUs. {totals.belowReorder} SKUs are below their reorder point and {totals.soldOut} {totals.soldOut === 1 ? "is" : "are"} sold out.
            </span>
          </div>
          <div aria-hidden="true" className="cc-prod-stats">
            <div className="cc-prod-stat"><div className="cond cc-stat-v">{totals.products}</div><div className="cc-stat-l">products</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v">{totals.skus}</div><div className="cc-stat-l">SKUs</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v" style={{ color: "var(--tape-ink)" }}>{totals.belowReorder}</div><div className="cc-stat-l">below reorder point</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v" style={{ color: "var(--problem)" }}>{totals.soldOut}</div><div className="cc-stat-l">sold out</div></div>
          </div>
          <div className="cc-btnrow">
            <Button>Import CSV</Button>
            <Button variant="tape" href="/admin/products/new">Add product</Button>
          </div>
        </div>
        <div role="tablist" aria-label="Product status" className="cc-tabs">
          {tabs.map((t) => (
            <button key={t.key} className="cc-flt" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} <span className={`cc-cnt ${t.countCls ?? ""}`}>{t.count}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="cc-listwrap">
        <div className="cc-filterbar cc-filterbar-between">
          <div className="cc-filterbar">
            <label htmlFor="pf" className="cc-visually-hidden">Filter products</label>
            <input id="pf" type="search" className="cc-search" style={{ width: 260 }} placeholder="Name, SKU or collection" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label htmlFor="col" className="cc-filter-label">Collection</label>
            <select id="col" className="cc-sel" value={collection} onChange={(e) => setCollection(e.target.value)}>
              <option value="all">All collections</option>
              {collections.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <label htmlFor="so" className="cc-filter-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Sort
            <select id="so" className="cc-sel" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="sold">Sold, last 30 days</option>
              <option value="stock">Stock, lowest first</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <section className="cc-panel" style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Products">
            <div role="row" className="cc-pr cc-pr-head">
              <span role="columnheader"></span>
              <span role="columnheader">Product</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Stock by variant</span>
              <span role="columnheader" className="cc-right">Price</span>
              <span role="columnheader" className="cc-right">Sold 30 d</span>
              <span role="columnheader">Storefront</span>
            </div>
            {sorted.map((r) => (
              <Link role="row" href={`/admin/products/${r.slug}`} className="cc-pr" key={r.slug} style={r.mutedRow ? { color: "var(--slate)" } : undefined}>
                <span
                  role="cell"
                  className="cc-thumb mono"
                  aria-hidden="true"
                  style={{ background: r.thumbBg, color: r.thumbColor }}
                >
                  {r.initials}
                </span>
                <span role="cell">
                  <b className="cc-pr-name">{r.name}</b>
                  <span className="cc-pr-meta">{r.meta}</span>
                </span>
                <span role="cell"><Stamp tone={r.statusTone}>{r.statusLabel}</Stamp></span>
                <span role="cell">
                  {r.variants.length > 0 ? (
                    <span className="cc-sksegs" aria-hidden="true">
                      {r.variants.map((v) => {
                        const g = segOf(v);
                        return <i key={v.sku} className={g === "low" ? "cc-seg-low" : g === "out" ? "cc-seg-out" : undefined} />;
                      })}
                    </span>
                  ) : null}
                  <span className="cc-stock-text">{stockText(r)}</span>
                </span>
                <span role="cell" className="cc-right">{r.priceLabel}</span>
                <span role="cell" className="cond cc-right cc-sold-figure" style={r.sold == null ? { color: "var(--muted)", fontWeight: 400, fontSize: 13 } : undefined}>
                  {r.sold == null ? "—" : r.sold}
                </span>
                <span role="cell" style={{ fontSize: 12 }}>{r.storefront}</span>
              </Link>
            ))}
            {sorted.length === 0 ? (
              <div style={{ padding: "26px 20px", borderTop: "1px solid var(--rule)", color: "var(--muted)", fontSize: 13 }}>
                No products match this view.
              </div>
            ) : null}
          </div>
          <div className="cc-panel-foot">
            <span>Showing {sorted.length} of {rows.length}</span>
          </div>
        </section>
        <p className="cc-seg-note">Each segment is one variant: green at or above its reorder point, amber below, outlined red at zero.</p>
      </div>
    </>
  );
}

/* --------------------------------------------------------- X-05 empty */
function EmptyCatalog() {
  const steps: { num: string; label: string; state: "done" | "now" | "todo"; action?: { label: string; href: string } }[] = [
    { num: "✓", label: "Name the store", state: "done" },
    { num: "02", label: "Add a product", state: "now", action: { label: "Add", href: "/admin/products/new" } },
    { num: "03", label: "Connect card payments", state: "todo", action: { label: "Connect", href: "/admin/settings" } },
    { num: "04", label: "Set shipping and cut-off", state: "todo", action: { label: "Set", href: "/admin/settings" } },
    { num: "05", label: "Invite whoever packs", state: "todo", action: { label: "Invite", href: "/admin/settings/team" } },
  ];
  return (
    <>
      <section className="cc-band"><h1 className="cc-h1">Products</h1></section>
      <div className="sr-page">
        <div className="cc-empty-grid">
          <section className="cc-panel cc-state-panel">
            <span className="cc-ico" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 13.5h12M2 8.5h12M3 2.5v11M13 2.5v11" /><path d="M5 8.5V5.5h3v3M9.5 13.5v-3h2.5v3" /></svg>
            </span>
            <div className="cc-state-stack">
              <span className="cc-state-stamp"><Stamp tone="slate">Empty shelf</Stamp></span>
              <h2 className="cc-big">Put the first thing on the shelf.</h2>
              <p className="cc-lead">A product needs a name, a price and a count. Colours and sizes can come later. You can also bring in a spreadsheet from another shop.</p>
              <div className="cc-state-actions">
                <Button variant="tape" href="/admin/products/new">Add a product</Button>
                <Button>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" /><path d="M9.5 1.5v3h3M5.5 8.5h5M5.5 11h5" /></svg>
                  Import a CSV
                </Button>
              </div>
              <span className="cc-state-foot-note">
                CSV needs: <span className="mono">name, SKU, price, quantity</span>. <a href="#" onClick={(e) => e.preventDefault()} style={{ fontWeight: 600 }}>Download the template</a>
              </span>
            </div>
          </section>

          <section className="cc-panel" aria-labelledby="st">
            <div className="cc-ph">
              <h2 id="st">Store setup</h2>
              <span className="mono cc-ph-mono">1 of 5</span>
            </div>
            <div style={{ padding: "16px 20px 2px" }}>
              <span className="cc-check-track"><i style={{ width: "20%" }} /></span>
            </div>
            <ol className="cc-setup-list">
              {steps.map((st) => (
                <li key={st.num}>
                  <span className={`mono cc-setup-num cc-setup-num-${st.state}`} aria-hidden="true">
                    {st.state === "done" ? (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
                    ) : st.num}
                  </span>
                  <span className={`cc-setup-label${st.state === "done" ? " cc-setup-done-label" : ""}`} style={st.state === "now" ? { fontWeight: 600 } : undefined}>
                    {st.label}
                  </span>
                  {st.action ? <Link href={st.action.href} style={{ fontSize: 12, fontWeight: 600 }}>{st.action.label}</Link> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
