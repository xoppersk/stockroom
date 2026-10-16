"use client";
/* S-03 — Product. Canonical: linen apron. Gallery PhotoBlocks, Swatches
   (aria-pressed), LIVE stock line per variant ("Only 3 left in Charcoal.
   24 more arrive Friday." — count from the store's skus), quantity, Add to
   cart (StoreButton, price in label) into the shop cart. A sold-out variant
   cannot be added unless the product's back-order toggle is on; the drawn
   explanation shows instead. Other slugs render the generic layout from
   fixture data. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { StoreFooter } from "../../_components/chrome";
import { PhotoBlock, Swatch, ClockIcon } from "../../_components/ui";
import { useShopCart } from "../../_components/use-shop";
import { APRON_VARIANTS, APRON_BACKORDER, NAPKIN_VARIANTS, MUG_VARIANTS, MUG_BACKORDER, productBySlug, type StoreVariant } from "../../_components/data";

const GALLERY: Record<string, { label: string; bg: string; cap: string }[]> = {
  "linen-apron": [
    { label: "Photo placeholder: charcoal apron, front", bg: "#3A3530", cap: "Photo · Charcoal, front" },
    { label: "Photo placeholder: cross-back straps", bg: "#57534E", cap: "Photo · cross-back" },
    { label: "Photo placeholder: pocket detail", bg: "#44403C", cap: "Photo · pocket detail" },
  ],
};

function TruckIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 4h8v7h-8zM9.5 6.5h3l2 2.5V11h-5" /><circle cx="4.5" cy="12" r="1.3" /><circle cx="11.5" cy="12" r="1.3" /></svg>); }
function ShopIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5 3 2.5h10l1 4M2.5 6.5V14h11V6.5" /><path d="M2 6.5c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 2 2s2-.8 2-2M6.5 14v-3.5h3V14" /></svg>); }
function ReturnIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3.5 2 6.5l3 3" /><path d="M2 6.5h7.5a4 4 0 0 1 0 8H6" /></svg>); }

export default function ProductClient({ slug }: { slug: string }) {
  const router = useRouter();
  const product = productBySlug(slug);
  const isApron = slug === "linen-apron";
  const isMug = slug === "stoneware-mug";
  const variants: (StoreVariant & { waitlist?: number })[] = isApron ? APRON_VARIANTS : isMug ? MUG_VARIANTS : slug === "linen-napkins" ? NAPKIN_VARIANTS : (product?.colours ?? []).map((c, i) => ({ sku: `${slug.toUpperCase()}-${i}`, colour: c.name, hex: c.hex, dark: false, priceCents: product!.priceCents, available: 8 }));
  const backorder = isApron ? APRON_BACKORDER : isMug ? MUG_BACKORDER : false;
  const [variantIdx, setVariantIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart, available, markTouched } = useShopCart();
  const variant = variants[variantIdx] ?? variants[0];
  const liveAvail = variant ? available(variant.sku) : undefined;
  const avail = liveAvail ?? variant?.available ?? 0;
  const soldOut = avail <= 0;
  const blocked = soldOut && !backorder;
  const name = isApron ? "Linen apron" : product?.name ?? slug.replace(/-/g, " ");
  const price = variant?.priceCents ?? product?.priceCents ?? 0;
  const gallery = GALLERY[slug] ?? [{ label: product?.photoLabel ?? `Photo placeholder: ${name}`, bg: product?.photoBg ?? "#E4E3DF", cap: "Photo" }];
  const goesWith = ["linen-napkins", "quilted-oven-mitts", "oak-serving-board", "canvas-market-tote"].filter((s) => s !== slug);

  const stockLine = useMemo(() => {
    if (!variant) return null;
    if (soldOut) {
      return (
        <span className="stockline bad" role="status">
          {variant.waitlist
            ? <>Sold out in {variant.colour}.{variant.incomingLabel ? ` ${variant.incomingLabel}` : ""} {variant.waitlist} people are on the waitlist — join the back-in-stock list below and we’ll email you.</>
            : <>Sold out in {variant.colour}.{variant.incomingLabel ? ` ${variant.incomingLabel}` : ""} Back-orders are off for this product, so we can’t take an order for it yet — join the back-in-stock list below and we’ll email you.</>}
        </span>
      );
    }
    if (avail <= 5) {
      return (
        <span className="stockline" role="status">
          <ClockIcon />Only {avail} left in {variant.colour}.{variant.incomingLabel ? ` ${variant.incomingLabel}` : ""}
        </span>
      );
    }
    return <span className="stockline ok" role="status">In stock in {variant.colour} — ships today.</span>;
  }, [variant, avail, soldOut]);

  const onAdd = () => {
    if (blocked || !variant) return;
    markTouched();
    addToCart({ sku: variant.sku, slug, name, variant: variant.colour, qty, priceCents: price, photoBg: variant.hex, photoLabel: `Photo placeholder: ${name.toLowerCase()}`, dark: variant.dark });
    setAdded(true);
    router.push("/cart");
  };

  return (
    <>
      <div className="swrap prod-wrap">
        <span className="mono crumb"><Link href="/">Home</Link> / <Link href="/collections/kitchen-textiles">Kitchen textiles</Link> / {name}</span>
        <div className="prod-grid">
          <div className="gallery">
            {gallery.map((g, i) => (
              <PhotoBlock key={g.label} label={g.label} bg={g.bg} dark capText={g.cap} className={i === 0 ? "wide" : "sq"} />
            ))}
            {gallery.length === 1 && <PhotoBlock label={`${name} — detail`} bg="#57534E" dark capText="Photo" className="sq" />}
          </div>

          <div className="prod-info">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h1>{name}</h1>
              <span className="prod-price">{money(price, { decimals: false })}</span>
              <p className="prod-desc">{isApron ? "Heavyweight stonewashed linen with a cross-back strap and two deep front pockets. Softens with every wash." : product?.description ?? "Made in small batches by makers we've visited. Counts on this site are live."}</p>
            </div>

            {variant && (
              <fieldset className="colour-fs">
                <legend>Colour: <b>{variant.colour}</b></legend>
                <div className="swrow">
                  {variants.map((v, i) => {
                    const vAvail = available(v.sku) ?? v.available;
                    return <Swatch key={v.sku} colour={v.colour} hex={v.hex} selected={i === variantIdx} soldOut={vAvail <= 0} onSelect={() => { setVariantIdx(i); setAdded(false); }} />;
                  })}
                </div>
                {stockLine}
              </fieldset>
            )}

            <form className="buyrow" onSubmit={(e) => { e.preventDefault(); onAdd(); }}>
              <label htmlFor="qty" className="sr-only">Quantity</label>
              <select id="qty" className="qty-sel" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="submit" className="sbtn" disabled={blocked} aria-disabled={blocked || undefined} title={blocked ? "Sold out — back-orders are off for this product" : undefined}>
                {blocked ? `Sold out in ${variant?.colour}` : <>Add to cart · <span className="mono" style={{ fontSize: 15 }}>{money(price * qty, { decimals: false })}</span></>}
              </button>
            </form>
            {added && <p role="status" style={{ margin: 0, fontSize: 14 }}>Added to your cart.</p>}

            <ul className="promises">
              <li className="as"><span className="ic"><TruckIcon /></span><span><b>Ships today</b> if you order in the next <b className="hl">3 h 12 min</b>.</span></li>
              <li className="as"><span className="ic"><ShopIcon /></span><span><b>Free pickup</b> at 2214 Fitzwater St, ready in 2 hours.</span></li>
              <li className="as"><span className="ic"><ReturnIcon /></span><span><b>30-day returns</b> on unworn, unwashed pieces.</span></li>
            </ul>

            <div className="prod-details">
              <details open>
                <summary>Size and fit</summary>
                <p>One size. 34 in long, 28 in wide. Cross-back straps fit most frames; the neck loop is not adjustable.</p>
              </details>
              <details>
                <summary>Materials and care</summary>
                <p>100% stonewashed linen, 245 g/m². Machine wash warm, tumble dry low.</p>
              </details>
              <details>
                <summary>Where it’s made</summary>
                <p>Linen woven in Lithuania by Baltic Linen Works. Cut and sewn on Fitzwater Street.</p>
              </details>
            </div>
          </div>
        </div>

        <section aria-labelledby="pw" className="goeswith">
          <h2 id="pw" className="h2">Goes with</h2>
          <div className="goes-grid">
            {goesWith.map((s) => {
              const gp = productBySlug(s)!;
              return (
                <Link key={s} href={s === "linen-napkins" ? "/products/linen-napkins" : "#"} className="card">
                  <PhotoBlock label={gp.photoLabel.replace("Photo placeholder: ", "Photo placeholder: ").replace("natural linen napkins", "napkins").replace("oven mitts", "oven mitts")} bg={gp.photoBg} dark={gp.dark} />
                  <b className="nm" style={{ fontWeight: 600 }}>{gp.name}</b>
                  <span className="pr">{gp.priceFrom && <span className="from">from </span>}{money(gp.priceCents, { decimals: false })}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      <StoreFooter variant="full" />
    </>
  );
}
