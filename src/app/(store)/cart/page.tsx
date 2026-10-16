"use client";
/* S-04 — Cart. Drawn state: Linen apron (Charcoal, "Only 3 left") ×1 +
   Linen napkins (Natural) ×1, the Terracotta mug sold-out notice, summary
   estimated total $109.80 (subtotal $100.00 + shipping from $9.80, tax at
   checkout). Lines come from the shop store; on first mount an untouched
   empty store is seeded with the drawn items (see use-shop adapter).
   Quantity steppers update totals live. Slim footer. */
import Link from "next/link";
import { money } from "@/lib/format";
import { StoreFooter, StoreSlimHeader, KeepShoppingLink } from "../_components/chrome";
import { PhotoBlock, LockIcon, ClockIcon } from "../_components/ui";
import { useShopCart } from "../_components/use-shop";

const SHIPPING_FROM = 980;

export default function CartPage() {
  const { lines, setQty, removeFromCart, available, demoSeeded, markTouched, cartNotice } = useShopCart();
  const subtotal = lines.reduce((n, l) => n + l.priceCents * l.qty, 0);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const estimated = subtotal + (lines.length ? SHIPPING_FROM : 0);
  const showMugNotice = demoSeeded || !!cartNotice;

  return (
    <>
      <StoreSlimHeader right={<KeepShoppingLink />} />
      <div className="swrap n txn">
        <section aria-labelledby="ct" className="cart-main">
          <h1 id="ct">Your cart</h1>

          {showMugNotice && (
            <div role="status" className="mug-notice">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#A15C00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.3" /><path d="M8 7.2v4M8 4.8v.4" /></svg>
              <span><b>Stoneware mug — Terracotta sold out</b> while it was in your cart, so we took it out. <span className="mono" style={{ fontSize: 13 }}>48</span> arrive Thursday.</span>
              <a href="#">Email me when it’s back</a>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="panel" style={{ padding: 24 }}>
              <p style={{ margin: 0, fontSize: 15 }}>Your cart is empty. <Link href="/collections/kitchen-textiles">Keep shopping</Link></p>
            </div>
          ) : (
            <div className="panel">
              {lines.map((l) => {
                const avail = l.sku === "LA-CHR" ? (available(l.sku) ?? 3) : undefined;
                return (
                  <div className="it" key={l.sku}>
                    <PhotoBlock label={l.photoLabel} bg={l.photoBg} dark={l.dark} style={{ padding: 8 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                      <b className="it-name">{l.name}</b>
                      <span className="it-var">{l.variant}</span>
                      {avail !== undefined && avail <= 3 ? (
                        <span className="stamp" style={{ color: "#A15C00", marginTop: 2 }}>Only {avail} left</span>
                      ) : (
                        <span className="note" style={{ marginTop: 3 }}>In stock</span>
                      )}
                      <button type="button" className="rm" onClick={() => { markTouched(); removeFromCart(l.sku); }}>Remove</button>
                    </div>
                    <div className="qt" role="group" aria-label={`Quantity, ${l.name}`}>
                      <button type="button" aria-label="One fewer" onClick={() => { markTouched(); setQty(l.sku, Math.max(1, l.qty - 1)); }}>−</button>
                      <span>{l.qty}</span>
                      <button type="button" aria-label="One more" onClick={() => { markTouched(); setQty(l.sku, l.qty + 1); }}>+</button>
                    </div>
                    <b className="mono" style={{ textAlign: "right", fontSize: 15, fontWeight: 600 }}>{money(l.priceCents * l.qty)}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel side-panel" aria-labelledby="sm">
          <div className="ph"><h2 id="sm">Summary</h2></div>
          <div className="side-body">
            <div className="row"><span>Subtotal · {itemCount} item{itemCount === 1 ? "" : "s"}</span><span>{money(subtotal)}</span></div>
            <div className="row"><span>Shipping</span><span style={{ color: "#57534E", fontFamily: "var(--font-sans)", fontWeight: 400 }}>from {money(SHIPPING_FROM)}</span></div>
            <div className="row"><span>Tax</span><span style={{ color: "#57534E", fontFamily: "var(--font-sans)", fontWeight: 400 }}>at checkout</span></div>
            <div className="tot"><span>Estimated total</span><span>{money(estimated)}</span></div>
            <Link href="/checkout" className="sbtn" style={{ marginTop: 18, height: 54, fontSize: 16 }} aria-disabled={lines.length === 0 || undefined}>
              <LockIcon />Check out
            </Link>
            <p className="cutoff-note"><ClockIcon size={16} /><span>Order in the next <b>3 h 12 min</b> and it ships today. Or pick it up free at the workshop.</span></p>
          </div>
          <details className="disc">
            <summary>Have a discount code?</summary>
            <div className="disc-row">
              <label htmlFor="dc" className="sr-only">Discount code</label>
              <input id="dc" className="in" placeholder="Code" />
              <button type="button" className="sbtn ol">Apply</button>
            </div>
          </details>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
