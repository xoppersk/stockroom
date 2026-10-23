"use client";
/* S-02 — Collection (real catalog). Products arrive from the server page
   (Supabase published products in this category). Filters (availability /
   colour / price) and sort live in the URL query, as before. No fixture
   fallback: an unknown category or an empty category renders honestly. */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { money } from "@/lib/format";
import { isDarkBg, placeholderBg, type ShopCategoryView, type ShopProductView } from "@/lib/shop/view";
import { StoreFooter } from "../../_components/chrome";

const PAGE_SIZE = 9;

function colourOf(p: ShopProductView): string[] {
  return p.variants.map((v) => v.colour).filter(Boolean);
}

function matches(p: ShopProductView, key: string, vals: string[]): boolean {
  if (!vals.length) return true;
  if (key === "availability") {
    return vals.some((v) =>
      v === "in" ? !p.soldOut : v === "ships" ? !p.soldOut : true,
    );
  }
  if (key === "colour") return colourOf(p).some((c) => vals.includes(c.toLowerCase()));
  if (key === "price") {
    return vals.some((v) =>
      v === "u30" ? p.priceCents < 3000 : v === "m" ? p.priceCents >= 3000 && p.priceCents <= 6000 : v === "o60" ? p.priceCents > 6000 : true,
    );
  }
  return true;
}

function ProductCard({ p }: { p: ShopProductView }) {
  const bg = placeholderBg(p.slug);
  const colours = [...new Set(colourOf(p))];
  return (
    <Link href={`/products/${p.slug}`} className="card">
      <span role="img" aria-label={p.images[0]?.alt || `Photo placeholder: ${p.name}`} className="img pcard-img" style={{ background: bg }}>
        <span className={`cap${isDarkBg(bg) ? " d" : ""}`}>Photo</span>
      </span>
      <span className="pcard-top"><b className="nm">{p.name}</b><span className="pr">{p.priceFrom && <span className="from">from </span>}{money(p.priceCents, { decimals: false })}</span></span>
      <span className="pcard-bot">
        <span className="note">{colours.length ? `${colours.length} option${colours.length > 1 ? "s" : ""}` : p.variants.length ? `${p.variants.length} variant${p.variants.length > 1 ? "s" : ""}` : ""}</span>
        {p.soldOut ? (
          <span className="stamp" style={{ color: "#B91C1C" }}>Sold out</span>
        ) : p.totalAvailable !== null && p.totalAvailable <= 5 ? (
          <span className="stamp" style={{ color: "#A15C00" }}>{p.totalAvailable} left</span>
        ) : p.totalAvailable !== null ? (
          <span className="note">In stock</span>
        ) : (
          <span className="note">{p.variants.length ? "Available at checkout" : ""}</span>
        )}
      </span>
    </Link>
  );
}

export default function CollectionClient({
  slug,
  category,
  products,
  error,
}: {
  slug: string;
  category: ShopCategoryView | null;
  products: ShopProductView[];
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const title = category?.name ?? slug.replace(/-/g, " ");
  const all = products;
  const total = all.length;

  const colourOptions = [...new Set(all.flatMap((p) => colourOf(p)))].slice(0, 8);

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
  if (sort === "new") filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const filtering = availability.length + colour.length + price.length > 0;
  const inStockCount = all.filter((p) => !p.soldOut).length;

  return (
    <>
      <section className="swrap coll-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="mono crumb"><Link href="/">Home</Link> / {title}</span>
          <h1>{title}</h1>
        </div>
        <label className="sort-lbl" htmlFor="srt">Sort
          <select id="srt" value={sort} onChange={(e) => setParam("sort", e.target.value === "best" ? null : e.target.value)}>
            <option value="best">Best sellers</option>
            <option value="price">Price, low to high</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </section>

      {error ? (
        <div className="swrap" style={{ paddingBottom: 48 }}>
          <div className="panel" style={{ padding: 24 }} role="alert">
            <p style={{ margin: 0, fontSize: 15 }}>We couldn’t load this collection from our database just now. Please try again in a moment.</p>
          </div>
        </div>
      ) : !category ? (
        <div className="swrap" style={{ paddingBottom: 48 }}>
          <div className="panel" style={{ padding: 24 }}>
            <p style={{ margin: 0, fontSize: 15 }}>There’s no collection called “{title}” in the shop. <Link href="/">Back to the shop</Link></p>
          </div>
        </div>
      ) : total === 0 ? (
        <div className="swrap" style={{ paddingBottom: 48 }}>
          <div className="panel" style={{ padding: 24 }}>
            <p style={{ margin: 0, fontSize: 15 }}>Nothing is published in {category.name} yet. When products are added they’ll appear here automatically.</p>
          </div>
        </div>
      ) : (
        <div className="swrap coll-body">
          <form aria-label="Filters" className="filters" onSubmit={(e) => e.preventDefault()}>
            <fieldset>
              <legend className="fh">Availability</legend>
              <label className="ck"><input type="checkbox" checked={availability.includes("in")} onChange={() => toggle("availability", availability, "in")} /> In stock now <span className="n">({inStockCount})</span></label>
              <label className="ck"><input type="checkbox" checked={availability.includes("ships")} onChange={() => toggle("availability", availability, "ships")} /> Ships today <span className="n">({inStockCount})</span></label>
            </fieldset>
            {colourOptions.length > 0 && (
              <fieldset>
                <legend className="fh">Colour</legend>
                {colourOptions.map((n) => (
                  <label className="ck" key={n}><input type="checkbox" checked={colour.includes(n.toLowerCase())} onChange={() => toggle("colour", colour, n.toLowerCase())} /> {n}</label>
                ))}
              </fieldset>
            )}
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
              {visible.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
            {hidden > 0 && (
              <button type="button" className="sbtn ol showmore" onClick={() => setParam("show", "all")}>Show {hidden} more</button>
            )}
            {filtered.length === 0 && <p style={{ fontSize: 15 }}>Nothing matches those filters. <button type="button" className="rm" style={{ fontSize: 14 }} onClick={() => router.replace(pathname)}>Clear filters</button></p>}
          </section>
        </div>
      )}
      <StoreFooter variant="full" />
    </>
  );
}
