"use client";
/* S-01 — Store home. Hero, shop by room (11 / 14 / 13 pieces), "What people
   are buying" with LIVE stock text from the store's skus, workshop story,
   full footer. Copy and values copied from screens/StoreHome.html. */
import Link from "next/link";
import { money } from "@/lib/format";
import { StoreFooter } from "./_components/chrome";
import { PhotoBlock, ArrowRight } from "./_components/ui";
import { useShopCart } from "./_components/use-shop";
import { productBySlug } from "./_components/data";

function BuyingCard({ slug }: { slug: string }) {
  const p = productBySlug(slug)!;
  const { available } = useShopCart();
  let note: React.ReactNode = null;
  if (p.stockNote.kind === "low" && p.stockNote.sku) {
    const live = available(p.stockNote.sku);
    const left = live ?? 3;
    note = <span className="stamp" style={{ color: "#A15C00" }}>{p.stockNote.colour}: {left} left</span>;
  } else if (p.stockNote.kind === "back") {
    note = <span className="stamp" style={{ color: "#57534E" }}>{p.stockNote.text}</span>;
  }
  const href = slug === "linen-apron" ? "/products/linen-apron" : "#";
  return (
    <Link href={href} className="card">
      <PhotoBlock label={p.photoLabel} bg={p.photoBg} dark={p.dark} className="buy-img" style={p.slug === "stoneware-mug" ? { boxShadow: "inset 0 0 0 1px #E4E3DF" } : undefined} />
      <span className="nm" style={{ fontWeight: 600 }}>{p.name}</span>
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span className="pr">{p.priceFrom && <span className="from">from </span>}{money(p.priceCents, { decimals: false })}</span>
        {note}
      </span>
    </Link>
  );
}

export default function StoreHomePage() {
  return (
    <>
      <section className="swrap hero">
        <div className="hero-copy">
          <h1>Made for the kitchen table. Used every day.</h1>
          <p>Linen, stoneware and oak from small makers, packed by hand in Philadelphia. When something sells out, we say so, and tell you when it’s back.</p>
          <div className="hero-cta">
            <Link href="/collections/kitchen-textiles" className="sbtn">Shop kitchen textiles <ArrowRight color="#FFFFFF" /></Link>
            <a href="#" className="nl" style={{ fontSize: 14, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 5 }}>See what’s new this week</a>
          </div>
        </div>
        <PhotoBlock label="Photo placeholder: charcoal linen apron hanging on an oak peg" bg="#3A3530" dark capText="Photo · Linen apron, Charcoal, on the workshop peg" className="hero-img" style={{ padding: 16 }} />
      </section>

      <section className="swrap rooms" aria-labelledby="sh">
        <h2 id="sh" className="h2">Shop by room</h2>
        <div className="rooms-grid">
          <Link href="/collections/kitchen-textiles" className="card">
            <PhotoBlock label="Photo placeholder: folded linen" bg="#D9D0C1" capText="Photo · folded linen" className="room-img" />
            <span className="nm room-name">Kitchen textiles</span>
            <span className="room-sub">Aprons, napkins, bread bags · <span className="mono">11 pieces</span></span>
          </Link>
          <Link href="/collections/tableware" className="card">
            <PhotoBlock label="Photo placeholder: stacked stoneware" bg="#8C5A3C" dark capText="Photo · stoneware on a shelf" className="room-img" />
            <span className="nm room-name">Tableware</span>
            <span className="room-sub">Mugs, boards, colanders · <span className="mono">14 pieces</span></span>
          </Link>
          <Link href="/collections/home" className="card">
            <PhotoBlock label="Photo placeholder: wool throw on a chair" bg="#6B7F6A" dark capText="Photo · wool throw on a chair" className="room-img" />
            <span className="nm room-name">Home</span>
            <span className="room-sub">Throws, candles, totes · <span className="mono">13 pieces</span></span>
          </Link>
        </div>
      </section>

      <section className="buying">
        <div className="swrap buying-in">
          <div className="buying-head">
            <h2 className="h2">What people are buying</h2>
            <a href="#" className="nl" style={{ fontSize: 14, fontWeight: 600 }}>Shop all <span className="mono" style={{ fontSize: 13 }}>38</span> <ArrowRight size={14} /></a>
          </div>
          <div className="buying-grid">
            <BuyingCard slug="stoneware-mug" />
            <BuyingCard slug="linen-apron" />
            <BuyingCard slug="canvas-market-tote" />
            <BuyingCard slug="beeswax-candles" />
          </div>
        </div>
      </section>

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
