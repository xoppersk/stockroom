/* S-01 — Store home, wired to the REAL catalog (src/lib/shop/catalog).
   Server component: categories + published products come from Supabase
   (public RLS). Honest states: a DB error renders an error panel; an
   empty live catalog renders an explicit "no products yet" panel —
   never fixture products. */
import { Suspense } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { getCategories, getProducts, isDarkBg, placeholderBg, type ShopProductView } from "@/lib/shop/catalog";
import { StoreFooter } from "./_components/chrome";
import { PhotoBlock, ArrowRight } from "./_components/ui";


function ProductCard({ p }: { p: ShopProductView }) {
  const bg = placeholderBg(p.slug);
  return (
    <Link href={`/products/${p.slug}`} className="card">
      <PhotoBlock
        label={p.images[0]?.alt || `Photo placeholder: ${p.name}`}
        bg={bg}
        dark={isDarkBg(bg)}
        className="buy-img"
      />
      <span className="nm" style={{ fontWeight: 600 }}>{p.name}</span>
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span className="pr">{p.priceFrom && <span className="from">from </span>}{money(p.priceCents, { decimals: false })}</span>
        {p.soldOut ? (
          <span className="stamp" style={{ color: "#B91C1C" }}>Sold out</span>
        ) : p.totalAvailable !== null && p.totalAvailable <= 5 ? (
          <span className="stamp" style={{ color: "#A15C00" }}>{p.totalAvailable} left</span>
        ) : p.totalAvailable !== null ? (
          <span className="stamp" style={{ color: "#57534E" }}>In stock</span>
        ) : null}
      </span>
    </Link>
  );
}

export default function StoreHomePage() {
  return (
    <Suspense fallback={null}>
      <StoreHomeInner />
    </Suspense>
  );
}

async function StoreHomeInner() {
  const [catsRes, prodsRes] = await Promise.all([getCategories(), getProducts()]);
  const categories = catsRes.ok ? catsRes.data.filter((c) => c.productCount > 0) : [];
  const products = prodsRes.ok ? prodsRes.data : [];
  const readError = !catsRes.ok ? catsRes.error : !prodsRes.ok ? prodsRes.error : null;
  const buying = products.slice(0, 4);
  const totalPieces = products.length;

  return (
    <>
      <section className="swrap hero">
        <div className="hero-copy">
          <h1>Made for the kitchen table. Used every day.</h1>
          <p>Linen, stoneware and oak from small makers, packed by hand in Philadelphia. When something sells out, we say so, and tell you when it’s back.</p>
          <div className="hero-cta">
            {categories[0] ? (
              <Link href={`/collections/${categories[0].slug}`} className="sbtn">Shop {categories[0].name.toLowerCase()} <ArrowRight color="#FFFFFF" /></Link>
            ) : (
              <Link href="#catalogue" className="sbtn">Browse the shop <ArrowRight color="#FFFFFF" /></Link>
            )}
            <a href="#buying" className="nl" style={{ fontSize: 14, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 5 }}>See what’s new this week</a>
          </div>
        </div>
        <PhotoBlock label="Photo placeholder: charcoal linen apron hanging on an oak peg" bg="#3A3530" dark capText="Photo · Linen apron, Charcoal, on the workshop peg" className="hero-img" style={{ padding: 16 }} />
      </section>

      {readError ? (
        <section className="swrap" style={{ paddingBottom: 48 }}>
          <div className="panel" style={{ padding: 24 }} role="alert">
            <h2 className="h2" style={{ marginTop: 0 }}>We couldn’t load the shop</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
              The catalogue didn’t come back from our database just now. Please try again in a moment — nothing here is cached or made up in the meantime.
            </p>
          </div>
        </section>
      ) : products.length === 0 ? (
        <section className="swrap" id="catalogue" style={{ paddingBottom: 48 }}>
          <div className="panel" style={{ padding: 24 }}>
            <h2 className="h2" style={{ marginTop: 0 }}>No products are on sale yet</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
              Our live catalogue is empty right now — when the next batch is published it will appear here automatically. Please check back soon.
            </p>
          </div>
        </section>
      ) : (
        <>
          {categories.length > 0 && (
            <section className="swrap rooms" aria-labelledby="sh">
              <h2 id="sh" className="h2">Shop by collection</h2>
              <div className="rooms-grid">
                {categories.slice(0, 3).map((c) => {
                  const bg = placeholderBg(c.slug);
                  return (
                    <Link key={c.slug} href={`/collections/${c.slug}`} className="card">
                      <PhotoBlock label={`Photo placeholder: ${c.name}`} bg={bg} dark={isDarkBg(bg)} capText={`Photo · ${c.name}`} className="room-img" />
                      <span className="nm room-name">{c.name}</span>
                      <span className="room-sub"><span className="mono">{c.productCount} piece{c.productCount === 1 ? "" : "s"}</span></span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="buying" id="buying">
            <div className="swrap buying-in">
              <div className="buying-head">
                <h2 className="h2">What people are buying</h2>
                <span className="nl" style={{ fontSize: 14, fontWeight: 600 }}>Shop all <span className="mono" style={{ fontSize: 13 }}>{totalPieces}</span></span>
              </div>
              <div className="buying-grid">
                {buying.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            </div>
          </section>
        </>
      )}

      <section className="swrap story" id="workshop">
        <div className="story-in">
          <PhotoBlock label="Photo placeholder: sewing table in the workshop" bg="#57534E" dark capText="Photo · the sewing table, Fitzwater Street" className="story-img" />
          <div className="story-copy">
            <h2 className="h2">Sewn four streets from where we pack it.</h2>
            <p>Our aprons and napkins are cut from Lithuanian linen and sewn in South Philadelphia. Everything else comes from makers we’ve visited. We keep small batches, so counts on this site are live.</p>
            <a href="#" className="story-link">Visit the workshop page <ArrowRight size={14} color="#F0A848" /></a>
          </div>
        </div>
      </section>

      <StoreFooter variant="full" />
    </>
  );
}
