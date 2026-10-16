"use client";
/* S-02 — Collection. Filters (availability / colour / price) are real
   controls whose state lives in the URL query; sort too. The first 9
   products show until "Show 2 more" (also URL state: ?show=all). Sold-out
   and made-to-order states as drawn. Stock text is live from store skus. */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { money } from "@/lib/format";
import { StoreFooter } from "../../_components/chrome";
import { useShopCart } from "../../_components/use-shop";
import { COLLECTIONS, KITCHEN_TEXTILES, ALL_PRODUCTS, type StoreProduct } from "../../_components/data";

const PAGE_SIZE = 9;

function matches(p: StoreProduct, key: string, vals: string[]): boolean {
  if (!vals.length) return true;
  if (key === "availability") {
    return vals.some((v) =>
      v === "in" ? p.stockNote.kind !== "soldout" : v === "ships" ? p.stockNote.kind !== "soldout" && p.stockNote.kind !== "made" : true,
    );
  }
  if (key === "colour") return p.colours.some((c) => vals.includes(c.name.toLowerCase()));
  if (key === "price") {
    return vals.some((v) =>
      v === "u30" ? p.priceCents < 3000 : v === "m" ? p.priceCents >= 3000 && p.priceCents <= 6000 : v === "o60" ? p.priceCents > 6000 : true,
    );
  }
  return true;
}

function ProductCard({ p }: { p: StoreProduct }) {
  const { available } = useShopCart();
  const href = p.slug === "linen-apron" ? "/products/linen-apron" : "#";
  let stock: React.ReactNode;
  if (p.stockNote.kind === "low" && p.stockNote.sku) {
    const live = available(p.stockNote.sku);
    stock = <span className="stamp" style={{ color: "#A15C00" }}>{p.stockNote.colour}: {live ?? 3} left</span>;
  } else if (p.stockNote.kind === "soldout") {
    stock = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#57534E" }}>
        <span className="stamp" style={{ color: "#B91C1C" }}>Sold out</span>
        <span style={{ textDecoration: "underline" }}>email me when it’s back</span>
      </span>
    );
  } else {
    stock = <span className="note">{p.stockNote.text}</span>;
  }
  return (
    <Link href={href} className="card">
      <span role="img" aria-label={p.photoLabel} className="img pcard-img" style={{ background: p.photoBg, ...(p.slug === "half-apron" ? { boxShadow: "inset 0 0 0 1px #D6D5D0" } : {}) }}>
        <span className={`cap${p.dark ? " d" : ""}`}>Photo</span>
      </span>
      <span className="pcard-top"><b className="nm">{p.name}</b><span className="pr">{p.priceFrom && <span className="from">from </span>}{money(p.priceCents, { decimals: false })}</span></span>
      <span className="pcard-bot">
        <span className="dots" aria-label={`${p.colours.length} colour${p.colours.length > 1 ? "s" : ""}`}>{p.colours.map((c) => <i key={c.name} style={{ background: c.hex }} />)}</span>
        {stock}
      </span>
    </Link>
  );
}

export default function CollectionClient({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const meta = COLLECTIONS[slug] ?? { title: slug.replace(/-/g, " "), lede: "", count: 0 };
  const all = slug === "kitchen-textiles" ? KITCHEN_TEXTILES : ALL_PRODUCTS.filter((p) => p.collection === slug);
  const total = slug === "kitchen-textiles" ? 11 : all.length;

  const get = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);
  const availability = get("availability");
  const colour = get("colour");
  const price = get("price");
  const sort = params.get("sort") ?? "best";
  const showAll = params.get("show") === "all";

  const setParam = (k: string, vals: string[] | string | null) => {
    const next = new URLSearchParams(params.toString());
    if (vals === null || (Array.isArray(vals) && !vals.length) || vals === "") next.delete(k);
    else next.set(k, Array.isArray(vals) ? vals.join(",") : vals);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const toggle = (k: string, cur: string[], v: string) =>
    setParam(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);

  let filtered = all.filter((p) => matches(p, "availability", availability) && matches(p, "colour", colour) && matches(p, "price", price));
  if (sort === "price") filtered = [...filtered].sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "new") filtered = [...filtered].reverse();
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const filtering = availability.length + colour.length + price.length > 0;

  return (
    <>
      <section className="swrap coll-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="mono crumb"><Link href="/">Home</Link> / {meta.title}</span>
          <h1>{meta.title}</h1>
          {meta.lede && <p className="lede">{meta.lede}</p>}
        </div>
        <label className="sort-lbl" htmlFor="srt">Sort
          <select id="srt" value={sort} onChange={(e) => setParam("sort", e.target.value === "best" ? null : e.target.value)}>
            <option value="best">Best sellers</option>
            <option value="price">Price, low to high</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </section>

      <div className="swrap coll-body">
        <form aria-label="Filters" className="filters" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend className="fh">Availability</legend>
            <label className="ck"><input type="checkbox" checked={availability.includes("in")} onChange={() => toggle("availability", availability, "in")} /> In stock now <span className="n">(10)</span></label>
            <label className="ck"><input type="checkbox" checked={availability.includes("ships")} onChange={() => toggle("availability", availability, "ships")} /> Ships today <span className="n">(10)</span></label>
          </fieldset>
          <fieldset>
            <legend className="fh">Colour</legend>
            {[{ n: "Charcoal", hex: "#3A3530" }, { n: "Natural", hex: "#D9D0C1" }, { n: "Rust", hex: "#9A4E2E" }].map((c) => (
              <label className="ck" key={c.n}><input type="checkbox" checked={colour.includes(c.n.toLowerCase())} onChange={() => toggle("colour", colour, c.n.toLowerCase())} /><i className="swc" style={{ background: c.hex }} /> {c.n}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="fh">Price</legend>
            <label className="ck"><input type="checkbox" checked={price.includes("u30")} onChange={() => toggle("price", price, "u30")} /> Under <span className="mono" style={{ fontSize: 13 }}>$30</span></label>
            <label className="ck"><input type="checkbox" checked={price.includes("m")} onChange={() => toggle("price", price, "m")} /> <span className="mono" style={{ fontSize: 13 }}>$30 – $60</span></label>
            <label className="ck"><input type="checkbox" checked={price.includes("o60")} onChange={() => toggle("price", price, "o60")} /> Over <span className="mono" style={{ fontSize: 13 }}>$60</span></label>
          </fieldset>
        </form>

        <section aria-label={`${total} products`} className="coll-grid-wrap">
          <span className="mono coll-count">{filtering ? `${filtered.length} of ${total} products` : `${total} products`}</span>
          <div className="coll-grid">
            {visible.map((p) => <ProductCard key={p.slug} p={p} />)}
          </div>
          {hidden > 0 && (
            <button type="button" className="sbtn ol showmore" onClick={() => setParam("show", "all")}>Show {hidden} more</button>
          )}
          {filtered.length === 0 && <p style={{ fontSize: 15 }}>Nothing matches those filters. <button type="button" className="rm" style={{ fontSize: 14 }} onClick={() => router.replace(pathname)}>Clear filters</button></p>}
        </section>
      </div>
      <StoreFooter variant="full" />
    </>
  );
}
