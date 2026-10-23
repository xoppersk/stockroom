"use client";
/* S-03 — Product (real catalog). The product, its variants and stock come
   from the server page (Supabase). Variant picker = the product's real
   variants; Add to cart posts the variant id to /api/cart/items, then
   routes to the real cart. A variant with known 0 stock cannot be added.
   When stock is not readable in this environment (no service key), the
   page says availability is confirmed at checkout instead of inventing
   counts — create_checkout_session enforces stock server-side. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { colourHex, isDarkBg, placeholderBg, type ShopProductView } from "@/lib/shop/view";
import { StoreFooter } from "../../_components/chrome";
import { PhotoBlock, Swatch, ClockIcon } from "../../_components/ui";
import { useShopCart } from "../../_components/use-shop";

function TruckIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 4h8v7h-8zM9.5 6.5h3l2 2.5V11h-5" /><circle cx="4.5" cy="12" r="1.3" /><circle cx="11.5" cy="12" r="1.3" /></svg>); }
function ShopIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5 3 2.5h10l1 4M2.5 6.5V14h11V6.5" /><path d="M2 6.5c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 2 2s2-.8 2-2M6.5 14v-3.5h3V14" /></svg>); }
function ReturnIcon() { return (<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3.5 2 6.5l3 3" /><path d="M2 6.5h7.5a4 4 0 0 1 0 8H6" /></svg>); }

export default function ProductClient({
  slug,
  product,
  related,
  error,
}: {
  slug: string;
  product: ShopProductView | null;
  related: ShopProductView[];
  error: string | null;
}) {
  const router = useRouter();
  const [variantIdx, setVariantIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const { addToCart, busy } = useShopCart();

  const variant = product?.variants[variantIdx] ?? product?.variants[0];
  const avail = variant?.available ?? null;
  const soldOut = avail !== null && avail <= 0;
  const blocked = !variant || soldOut;
  const price = variant?.priceCents ?? product?.priceCents ?? 0;
  const bg = product ? placeholderBg(product.slug) : "#E4E3DF";

  const gallery = useMemo(() => {
    if (!product) return [];
    if (product.images.length > 0) {
      return product.images.map((img, i) => ({
        label: img.alt || `Photo placeholder: ${product.name}`,
        bg,
        cap: i === 0 ? "Photo" : `Photo · ${i + 1}`,
      }));
    }
    return [{ label: `Photo placeholder: ${product.name}`, bg, cap: "Photo" }];
  }, [product, bg]);

  const stockLine = useMemo(() => {
    if (!variant) return null;
    if (avail === null) {
      return <span className="stockline" role="status">Availability is confirmed when you check out.</span>;
    }
    if (soldOut) {
      return (
        <span className="stockline bad" role="status">
          Sold out in {variant.title}. We can’t take an order for it yet — check back when it’s restocked.
        </span>
      );
    }
    if (avail <= 5) {
      return (
        <span className="stockline" role="status">
          <ClockIcon />Only {avail} left in {variant.title}.
        </span>
      );
    }
    return <span className="stockline ok" role="status">In stock in {variant.title} — ships today.</span>;
  }, [variant, avail, soldOut]);

  const onAdd = async () => {
    if (blocked || !variant || busy) return;
    setAddError(null);
    const res = await addToCart(variant.id, qty);
    if (!res.ok) {
      setAddError(res.error ?? "Could not add that item. Please try again.");
      return;
    }
    setAdded(true);
    router.push("/cart");
  };

  if (error) {
    return (
      <>
        <div className="swrap prod-wrap">
          <div className="panel" style={{ padding: 24 }} role="alert">
            <h1 style={{ marginTop: 0 }}>We couldn’t load this product</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>The product didn’t come back from our database just now. Please try again in a moment.</p>
            <Link href="/" className="sbtn ol">Back to the shop</Link>
          </div>
        </div>
        <StoreFooter variant="full" />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <div className="swrap prod-wrap">
          <div className="panel" style={{ padding: 24 }}>
            <h1 style={{ marginTop: 0 }}>This product isn’t on sale</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>“{slug.replace(/-/g, " ")}" isn’t in the live catalogue — it may have been unpublished or the link is old.</p>
            <Link href="/" className="sbtn ol">Back to the shop</Link>
          </div>
        </div>
        <StoreFooter variant="full" />
      </>
    );
  }

  return (
    <>
      <div className="swrap prod-wrap">
        <span className="mono crumb">
          <Link href="/">Home</Link>
          {product.categorySlug && <> / <Link href={`/collections/${product.categorySlug}`}>{product.categoryName}</Link></>}
          {" / "}{product.name}
        </span>
        <div className="prod-grid">
          <div className="gallery">
            {gallery.map((g, i) => (
              <PhotoBlock key={`${g.label}-${i}`} label={g.label} bg={g.bg} dark={isDarkBg(g.bg)} capText={g.cap} className={i === 0 ? "wide" : "sq"} />
            ))}
            {gallery.length === 1 && <PhotoBlock label={`${product.name} — detail`} bg="#57534E" dark capText="Photo" className="sq" />}
          </div>

          <div className="prod-info">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h1>{product.name}</h1>
              <span className="prod-price">
                {money(price, { decimals: false })}
                {variant?.compareAtCents != null && variant.compareAtCents > price && (
                  <span style={{ marginLeft: 10, textDecoration: "line-through", color: "#57534E", fontSize: 16 }}>{money(variant.compareAtCents, { decimals: false })}</span>
                )}
              </span>
              <p className="prod-desc">{product.description || "Made in small batches by makers we've visited. Counts on this site are live."}</p>
            </div>

            {variant && (
              <fieldset className="colour-fs">
                <legend>Option: <b>{variant.title}</b></legend>
                <div className="swrow">
                  {product.variants.map((v, i) => (
                    <Swatch
                      key={v.id}
                      colour={v.colour}
                      hex={colourHex(v.colour)}
                      selected={i === variantIdx}
                      soldOut={v.available !== null && v.available <= 0}
                      onSelect={() => { setVariantIdx(i); setAdded(false); setAddError(null); }}
                    />
                  ))}
                </div>
                {stockLine}
                <p className="note" style={{ margin: 0 }}>SKU <span className="mono">{variant.sku}</span></p>
              </fieldset>
            )}

            <form className="buyrow" onSubmit={(e) => { e.preventDefault(); void onAdd(); }}>
              <label htmlFor="qty" className="sr-only">Quantity</label>
              <select id="qty" className="qty-sel" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="submit" className="sbtn" disabled={blocked || busy} aria-disabled={blocked || busy || undefined} title={soldOut ? "Sold out" : undefined}>
                {soldOut ? `Sold out in ${variant?.title}` : busy ? "Adding…" : <>Add to cart · <span className="mono" style={{ fontSize: 15 }}>{money(price * qty, { decimals: false })}</span></>}
              </button>
            </form>
            {added && <p role="status" style={{ margin: 0, fontSize: 14 }}>Added to your cart.</p>}
            {addError && <p role="alert" style={{ margin: 0, fontSize: 14, color: "#B91C1C" }}>{addError}</p>}

            <ul className="promises">
              <li className="as"><span className="ic"><TruckIcon /></span><span><b>Ships today</b> if you order by <b className="hl">2:00 PM Eastern</b>.</span></li>
              <li className="as"><span className="ic"><ShopIcon /></span><span><b>Free pickup</b> at 2214 Fitzwater St — we’ll email when it’s ready.</span></li>
              <li className="as"><span className="ic"><ReturnIcon /></span><span><b>30-day returns</b> on unworn, unwashed pieces.</span></li>
            </ul>

            <div className="prod-details">
              <details open>
                <summary>Details</summary>
                <p>{product.description || "Made in small batches. Counts on this site are live."}</p>
              </details>
              {product.tags.length > 0 && (
                <details>
                  <summary>Tags</summary>
                  <p>{product.tags.join(" · ")}</p>
                </details>
              )}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="pw" className="goeswith">
            <h2 id="pw" className="h2">Goes with</h2>
            <div className="goes-grid">
              {related.map((gp) => {
                const gbg = placeholderBg(gp.slug);
                return (
                  <Link key={gp.id} href={`/products/${gp.slug}`} className="card">
                    <PhotoBlock label={gp.images[0]?.alt || `Photo placeholder: ${gp.name}`} bg={gbg} dark={isDarkBg(gbg)} />
                    <b className="nm" style={{ fontWeight: 600 }}>{gp.name}</b>
                    <span className="pr">{gp.priceFrom && <span className="from">from </span>}{money(gp.priceCents, { decimals: false })}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <StoreFooter variant="full" />
    </>
  );
}
