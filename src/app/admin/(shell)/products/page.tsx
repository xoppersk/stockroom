"use client";

/* C-04 Products (+ X-05 empty catalog) — exact build of screens/Products.html
   and SysEmptyCatalog.html. Status tabs live in the URL query (?tab=) as
   real tab buttons (§10); collection/sort/search are labelled controls.
   Stock-by-variant cells: one segment per variant — green at/above reorder,
   amber below, outlined red at zero (Products.html footnote). Data:
   @/lib/api listProducts(), normalised to the §9 canon. */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { listProducts } from "@/lib/api";
import { money } from "@/lib/format";
import "@/styles/console-core.css";

type AnyRec = Record<string, unknown>;
const arr = (v: unknown): AnyRec[] => (Array.isArray(v) ? (v as AnyRec[]) : []);
const n = (v: unknown, f: number): number => (typeof v === "number" && Number.isFinite(v) ? v : f);
const s = (v: unknown, f: string): string => (typeof v === "string" && v.length > 0 ? v : f);

type Seg = "ok" | "low" | "out";
type ProductRow = {
  slug: string;
  initials: string;
  thumbBg: string;
  thumbColor: string;
  thumbDashed?: boolean;
  name: string;
  meta: string;
  statusLabel: string;
  statusTone: StampTone;
  statusKey: string; // active | draft | archived
  needsRestock: boolean;
  segs: Seg[];
  stockText: React.ReactNode;
  priceLabel: string;
  sold: number | null;
  storefront: string;
  mutedRow?: boolean;
};

/* Products.html — showing 9 of 38. */
const CANON: ProductRow[] = [
  {
    slug: "stoneware-mug", initials: "SM", thumbBg: "#8C5A3C", thumbColor: "#FFFFFF",
    name: "Stoneware mug", meta: "3 variants · Tableware",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: true,
    segs: ["out", "ok", "low"],
    stockText: <><b className="cc-stock-bad">Terracotta 0</b> · White 22 · Moss 11</>,
    priceLabel: "$28.00", sold: 61, storefront: "Visible, 1 sold out",
  },
  {
    slug: "linen-apron", initials: "LA", thumbBg: "#3A3530", thumbColor: "#FFFFFF",
    name: "Linen apron", meta: "3 variants · Kitchen textiles",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: true,
    segs: ["low", "ok", "ok"],
    stockText: <><b className="cc-stock-warn">Charcoal 3</b> · Natural 14 · Rust 9</>,
    priceLabel: "$64.00", sold: 38, storefront: "Visible",
  },
  {
    slug: "canvas-market-tote", initials: "CT", thumbBg: "#C9B79A", thumbColor: "var(--ink)",
    name: "Canvas market tote", meta: "1 variant · Home",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: true,
    segs: ["low"],
    stockText: <><b className="cc-stock-warn">5 on hand</b> · reorder at 10 · count pending</>,
    priceLabel: "$46.00", sold: 29, storefront: "Visible",
  },
  {
    slug: "beeswax-candles", initials: "BC", thumbBg: "#E8D5A8", thumbColor: "var(--ink)",
    name: "Beeswax candles", meta: "2 variants · Home",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: false,
    segs: ["ok", "ok"],
    stockText: <>Pillar 40 · Taper pair 26</>,
    priceLabel: "from $14.00", sold: 27, storefront: "Visible",
  },
  {
    slug: "oak-serving-board", initials: "OS", thumbBg: "#A57B4F", thumbColor: "#FFFFFF",
    name: "Oak serving board", meta: "2 variants · Tableware",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: false,
    segs: ["ok", "ok"],
    stockText: <>Small 19 · Large 34</>,
    priceLabel: "from $38.00", sold: 17, storefront: "Visible",
  },
  {
    slug: "linen-napkins", initials: "NP", thumbBg: "#6B7F6A", thumbColor: "#FFFFFF",
    name: "Linen napkins, set of 4", meta: "2 variants · Kitchen textiles",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: true,
    segs: ["ok", "low"],
    stockText: <>Natural 12 · <b className="cc-stock-warn">Charcoal 4</b></>,
    priceLabel: "$36.00", sold: 15, storefront: "Visible",
  },
  {
    slug: "wool-throw", initials: "WT", thumbBg: "#D9D4C7", thumbColor: "var(--ink)",
    name: "Wool throw", meta: "2 variants · Home",
    statusLabel: "Active", statusTone: "paid", statusKey: "active", needsRestock: true,
    segs: ["low", "low"],
    stockText: <><b className="cc-stock-warn">Oat 6 · Rust 4</b></>,
    priceLabel: "$148.00", sold: 9, storefront: "Visible",
  },
  {
    slug: "linen-tea-towel", initials: "TT", thumbBg: "#EDEDEA", thumbColor: "#57534E", thumbDashed: true,
    name: "Linen tea towel", meta: "4 variants · no photos yet",
    statusLabel: "Draft", statusTone: "muted", statusKey: "draft", needsRestock: false,
    segs: [],
    stockText: <span style={{ color: "var(--slate)" }}>Stock not entered</span>,
    priceLabel: "$22.00", sold: null, storefront: "Hidden",
  },
  {
    slug: "brass-bottle-opener", initials: "BO", thumbBg: "#E4E3DF", thumbColor: "#6F6A64",
    name: "Brass bottle opener", meta: "1 variant · discontinued Aug 30",
    statusLabel: "Archived", statusTone: "muted", statusKey: "archived", needsRestock: false,
    segs: [],
    stockText: <>0 left</>,
    priceLabel: "$19.00", sold: 0, storefront: "Hidden", mutedRow: true,
  },
];

const TABS: { key: string; label: string; count: number; countCls?: string }[] = [
  { key: "all", label: "All", count: 38, countCls: "cc-cnt-ink" },
  { key: "active", label: "Active", count: 34, countCls: "cc-cnt-soft" },
  { key: "draft", label: "Draft", count: 3, countCls: "cc-cnt-soft" },
  { key: "archived", label: "Archived", count: 1, countCls: "cc-cnt-soft" },
  { key: "restock", label: "Needs restock", count: 11, countCls: "cc-cnt-tape" },
];

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsInner />
    </Suspense>
  );
}

function ProductsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") ?? "all";
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [sort, setSort] = useState("sold");

  const rows = useMemo<ProductRow[]>(() => {
    /* Overlay API values onto the screen's 9 rows BY SLUG (the fixture's
       catalogue order differs from Products.html; the screen is truth). */
    const raw = arr(listProducts());
    if (!raw.length) return CANON;
    const bySlug = new Map(raw.map((p) => [s(p.slug, ""), p]));
    return CANON.map((c) => {
      const p = bySlug.get(c.slug);
      if (!p) return c;
      const price = n(p.priceCents, NaN);
      return {
        ...c,
        name: s(p.name ?? p.title, c.name),
        priceLabel: Number.isFinite(price) ? (c.priceLabel.startsWith("from") ? `from ${money(price)}` : money(price)) : c.priceLabel,
        sold: typeof p.sold30d === "number" ? p.sold30d : c.sold,
      };
    });
  }, []);

  const visible = rows.filter((r) => {
    if (tab === "active" && r.statusKey !== "active") return false;
    if (tab === "draft" && r.statusKey !== "draft") return false;
    if (tab === "archived" && r.statusKey !== "archived") return false;
    if (tab === "restock" && !r.needsRestock) return false;
    if (collection !== "all" && !r.meta.toLowerCase().includes(collection)) return false;
    if (query && !`${r.name} ${r.meta}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const sorted = [...visible].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : (b.sold ?? -1) - (a.sold ?? -1),
  );

  function setTab(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "all") next.delete("tab");
    else next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (params.get("state") === "empty") return <EmptyCatalog />;

  return (
    <>
      {/* Summary band + tabs (Products.html) */}
      <section className="cc-band cc-band-tabs">
        <div className="cc-prod-band-grid">
          <div className="cc-band-stack">
            <h1 className="cc-h1">Products</h1>
            <span className="cc-sub">38 products, 96 SKUs. 18 SKUs are below their reorder point and 1 is sold out.</span>
          </div>
          <div aria-hidden="true" className="cc-prod-stats">
            <div className="cc-prod-stat"><div className="cond cc-stat-v">38</div><div className="cc-stat-l">products</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v">96</div><div className="cc-stat-l">SKUs</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v" style={{ color: "var(--tape-ink)" }}>18</div><div className="cc-stat-l">below reorder point</div></div>
            <div className="cc-prod-stat"><div className="cond cc-stat-v" style={{ color: "var(--problem)" }}>1</div><div className="cc-stat-l">sold out</div></div>
          </div>
          <div className="cc-btnrow">
            <Button>Import CSV</Button>
            <Button variant="tape" href="/admin/products/new">Add product</Button>
          </div>
        </div>
        <div role="tablist" aria-label="Product status" className="cc-tabs">
          {TABS.map((t) => (
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
              <option value="kitchen textiles">Kitchen textiles</option>
              <option value="tableware">Tableware</option>
              <option value="home">Home</option>
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
                  style={{
                    background: r.thumbBg,
                    color: r.thumbColor,
                    outline: r.thumbDashed ? "1px dashed var(--control)" : undefined,
                    outlineOffset: r.thumbDashed ? -1 : undefined,
                  }}
                >
                  {r.initials}
                </span>
                <span role="cell">
                  <b className="cc-pr-name">{r.name}</b>
                  <span className="cc-pr-meta">{r.meta}</span>
                </span>
                <span role="cell"><Stamp tone={r.statusTone}>{r.statusLabel}</Stamp></span>
                <span role="cell">
                  {r.segs.length > 0 ? (
                    <span className="cc-sksegs" aria-hidden="true">
                      {r.segs.map((g, i) => (
                        <i key={i} className={g === "low" ? "cc-seg-low" : g === "out" ? "cc-seg-out" : undefined} />
                      ))}
                    </span>
                  ) : null}
                  <span className="cc-stock-text">{r.stockText}</span>
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
            <span>Showing {sorted.length} of 38</span>
            <a href="#" onClick={(e) => e.preventDefault()}>Show 29 more</a>
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
                  <span className={`cc-setup-label${st.state === "done" ? " cc-setup-done-label" : st.state === "now" ? "" : ""}`} style={st.state === "now" ? { fontWeight: 600 } : undefined}>
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
