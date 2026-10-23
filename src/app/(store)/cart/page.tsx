"use client";
/* S-04 — Cart, wired to the REAL cart (carts/cart_items via /api/cart).
   Lines, prices and totals come from the server; quantity steppers and
   remove go through PATCH/DELETE /api/cart/items/[itemId]; discount codes
   validate live against the DB. Honest states: while loading, when the
   cart service isn't configured in this environment, and when empty. */
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import { StoreFooter, StoreSlimHeader, KeepShoppingLink } from "../_components/chrome";
import { PhotoBlock, LockIcon, ClockIcon } from "../_components/ui";
import { useShopCart } from "../_components/use-shop";

export default function CartPage() {
  const {
    lines, count, loaded, busy, error,
    subtotalCents, discountCents, totalCents, discountCode,
    setQty, removeFromCart, applyDiscount, removeDiscount,
  } = useShopCart();
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

  const onApplyCode = async () => {
    if (!code.trim()) return;
    const res = await applyDiscount(code);
    setCodeMsg(res.ok ? `Code ${code.trim().toUpperCase()} applied.` : (res.error ?? "That code isn't valid."));
    if (res.ok) setCode("");
  };

  return (
    <>
      <StoreSlimHeader right={<KeepShoppingLink />} />
      <div className="swrap n txn">
        <section aria-labelledby="ct" className="cart-main">
          <h1 id="ct">Your cart</h1>

          {error && (
            <div role="alert" className="mug-notice" style={{ marginBottom: 16 }}>
              <span>{error}</span>
            </div>
          )}

          {!loaded ? (
            <div className="panel" style={{ padding: 24 }}>
              <p style={{ margin: 0, fontSize: 15 }}>Loading your cart…</p>
            </div>
          ) : lines.length === 0 ? (
            <div className="panel" style={{ padding: 24 }}>
              <p style={{ margin: 0, fontSize: 15 }}>
                Your cart is empty. <Link href="/">Keep shopping</Link>
                {" "}— if you just signed in and expected items here, they’ll be attached to your account’s cart.
              </p>
            </div>
          ) : (
            <div className="panel">
              {lines.map((l) => (
                <div className="it" key={l.itemId}>
                  <PhotoBlock label={l.photoLabel} bg={l.photoBg} dark={l.dark} style={{ padding: 8 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                    <b className="it-name"><Link href={`/products/${l.slug}`} style={{ color: "inherit" }}>{l.name}</Link></b>
                    <span className="it-var">{l.variant} · <span className="mono" style={{ fontSize: 12 }}>{l.sku}</span></span>
                    {l.available !== null && l.available <= 0 ? (
                      <span className="stamp" style={{ color: "#B91C1C", marginTop: 2 }}>Out of stock</span>
                    ) : l.available !== null && l.available <= 3 ? (
                      <span className="stamp" style={{ color: "#A15C00", marginTop: 2 }}>Only {l.available} left</span>
                    ) : (
                      <span className="note" style={{ marginTop: 3 }}>In stock</span>
                    )}
                    <button type="button" className="rm" disabled={busy} onClick={() => void removeFromCart(l.itemId)}>Remove</button>
                  </div>
                  <div className="qt" role="group" aria-label={`Quantity, ${l.name}`}>
                    <button type="button" aria-label="One fewer" disabled={busy || l.qty <= 1} onClick={() => void setQty(l.itemId, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button type="button" aria-label="One more" disabled={busy} onClick={() => void setQty(l.itemId, l.qty + 1)}>+</button>
                  </div>
                  <b className="mono" style={{ textAlign: "right", fontSize: 15, fontWeight: 600 }}>{money(l.lineTotalCents)}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="panel side-panel" aria-labelledby="sm">
          <div className="ph"><h2 id="sm">Summary</h2></div>
          <div className="side-body">
            <div className="row"><span>Subtotal · {count} item{count === 1 ? "" : "s"}</span><span>{money(subtotalCents)}</span></div>
            {discountCents > 0 && (
              <div className="row"><span>Discount{discountCode ? ` · ${discountCode}` : ""}</span><span>−{money(discountCents)}</span></div>
            )}
            <div className="row"><span>Shipping</span><span style={{ color: "#57534E", fontFamily: "var(--font-sans)", fontWeight: 400 }}>calculated at fulfilment</span></div>
            <div className="row"><span>Tax</span><span style={{ color: "#57534E", fontFamily: "var(--font-sans)", fontWeight: 400 }}>calculated at fulfilment</span></div>
            <div className="tot"><span>Total</span><span>{money(totalCents)}</span></div>
            <Link
              href="/checkout"
              className="sbtn"
              style={{ marginTop: 18, height: 54, fontSize: 16, ...(lines.length === 0 ? { pointerEvents: "none", opacity: 0.5 } : {}) }}
              aria-disabled={lines.length === 0 || undefined}
            >
              <LockIcon />Check out
            </Link>
            <p className="cutoff-note"><ClockIcon size={16} /><span>Order by <b>2:00 PM Eastern</b> and it ships today. Or pick it up free at the workshop.</span></p>
            <p className="note" style={{ marginTop: 8 }}>Online payment isn’t enabled yet — checkout records your order as <b>pending</b> and we’ll confirm by email.</p>
          </div>
          <details className="disc" open={!!discountCode}>
            <summary>Have a discount code?</summary>
            {discountCode ? (
              <div className="disc-row" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 14 }}>{discountCode}</span>
                <button type="button" className="sbtn ol" disabled={busy} onClick={() => void removeDiscount()}>Remove</button>
              </div>
            ) : (
              <div className="disc-row">
                <label htmlFor="dc" className="sr-only">Discount code</label>
                <input id="dc" className="in" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
                <button type="button" className="sbtn ol" disabled={busy || !code.trim()} onClick={() => void onApplyCode()}>Apply</button>
              </div>
            )}
            {codeMsg && <p role="status" style={{ margin: "8px 0 0", fontSize: 13 }}>{codeMsg}</p>}
          </details>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
