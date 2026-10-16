"use client";
/* S-05 — Checkout (one page) + X-07 (?state=declined).
   S-05: contact, delivery with the USPS-confirmed address, shipping radios
   (USPS $9.80 / UPS 2nd Day Air $18.40 / pickup free — screen values govern),
   card fields. The apron is held for 15 minutes: the hold starts on mount
   and the countdown is LIVE from the store's checkoutHoldExpiresAt.
   "Place order" is the charge moment — nothing is charged before it — and
   routes to /order/ORD-1053.
   X-07: blocking banner (role="alert") "Your bank declined the card. You
   haven't been charged.", card field in error, items held until the hold
   expiry (drawn 10:59 AM), Try again / Apple Pay. */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/format";
import { StoreFooter, StoreSlimHeader, Wordmark } from "../_components/chrome";
import { LockIcon, ClockIcon } from "../_components/ui";
import { useShopCart, useNow } from "../_components/use-shop";
import { SHIPPING_OPTIONS, TAX_RATE } from "../_components/data";

function fmtClock(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function CheckoutClient() {
  const params = useSearchParams();
  const declined = params.get("state") === "declined";
  return declined ? <DeclinedCheckout /> : <CheckoutForm />;
}

function useOrderMath() {
  /* SR-02: the checkout reads the REAL cart from the store — no canned
     fallback. The drawn S-05 state is what the store's seeded cart
     produces (apron + napkins = $100.00, $115.80 all-in with USPS). */
  const { lines } = useShopCart();
  const items = lines;
  const subtotal = items.reduce((n, l) => n + l.priceCents * l.qty, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  return { items, subtotal, tax };
}

function useHold() {
  const { holdExpiresAt, startHold } = useShopCart();
  const startedRef = useRef(false);
  const [localExpiry, setLocalExpiry] = useState<number | null>(null);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startHold();
    setLocalExpiry(Date.now() + 15 * 60 * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const expiry = holdExpiresAt ?? localExpiry;
  const now = useNow(!!expiry);
  const leftMs = expiry ? expiry - now : 0;
  return { expiry, leftMs };
}

function CheckoutForm() {
  const router = useRouter();
  const { items, subtotal, tax } = useOrderMath();
  const [shipId, setShipId] = useState<string>("usps");
  const ship = SHIPPING_OPTIONS.find((s) => s.id === shipId) ?? SHIPPING_OPTIONS[0];
  const total = subtotal + ship.cents + tax;
  const { leftMs } = useHold();
  const itemCount = items.reduce((n, l) => n + l.qty, 0);
  const first = items[0];
  const holdName = first
    ? first.sku === "LA-CHR"
      ? "your Charcoal apron"
      : `your ${first.name.toLowerCase()}`
    : "your items";

  if (items.length === 0) {
    return (
      <>
        <StoreSlimHeader right={<Link href="/cart" style={{ fontSize: 14, fontWeight: 500 }}>Back to cart</Link>} />
        <div className="swrap n txn wide" style={{ paddingTop: 36 }}>
          <section className="panel sec" aria-labelledby="ce">
            <h2 id="ce">Your cart is empty</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              There’s nothing to check out yet. <Link href="/collections/kitchen-textiles">Keep shopping</Link> — your
              items will be held for 15 minutes once you start checkout.
            </p>
          </section>
        </div>
        <StoreFooter variant="slim" />
      </>
    );
  }

  return (
    <>
      <StoreSlimHeader right={<Link href="/cart" style={{ fontSize: 14, fontWeight: 500 }}>Back to cart</Link>} />
      <div className="swrap n txn wide" style={{ paddingTop: 36 }}>
        <form className="co-form" onSubmit={(e) => { e.preventDefault(); router.push("/order/ORD-1053"); }}>
          <section className="panel sec" aria-labelledby="c1">
            <h2 id="c1"><span className="ix" aria-hidden="true">01</span>Contact</h2>
            <div className="f"><label htmlFor="em">Email for your receipt and tracking</label><input id="em" className="in" type="email" defaultValue="nia.okoye@sevynlabs.io" /></div>
            <label className="cb"><input type="checkbox" defaultChecked />Email me once when sold-out things come back</label>
          </section>

          <section className="panel sec" aria-labelledby="c2">
            <h2 id="c2"><span className="ix" aria-hidden="true">02</span>Delivery</h2>
            <div className="f2">
              <div className="f"><label htmlFor="fn">First name</label><input id="fn" className="in" defaultValue="Nia" /></div>
              <div className="f"><label htmlFor="ln">Last name</label><input id="ln" className="in" defaultValue="Okoye" /></div>
            </div>
            <div className="f"><label htmlFor="ad">Street address</label><input id="ad" className="in" defaultValue="418 Christian Street, Apt 2" /></div>
            <div className="f3">
              <div className="f"><label htmlFor="ci">City</label><input id="ci" className="in" defaultValue="Philadelphia" /></div>
              <div className="f"><label htmlFor="stt">State</label><input id="stt" className="in" defaultValue="PA" /></div>
              <div className="f"><label htmlFor="zp">ZIP</label><input id="zp" className="in" defaultValue="19147" style={{ fontFamily: "var(--font-mono)" }} /></div>
            </div>
            <span className="usps-ok">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              Address confirmed with USPS.
            </span>
          </section>

          <section className="panel sec" aria-labelledby="c3">
            <h2 id="c3"><span className="ix" aria-hidden="true">03</span>How it gets to you</h2>
            <div role="radiogroup" aria-labelledby="c3" className="ship-group">
              {SHIPPING_OPTIONS.map((o) => (
                <label key={o.id} className={`opt${shipId === o.id ? " on" : ""}`}>
                  <input type="radio" name="sh" checked={shipId === o.id} onChange={() => setShipId(o.id)} />
                  <span><b>{o.name}</b><br /><span className="opt-sub">{o.sub}</span></span>
                  <b>{o.label}</b>
                </label>
              ))}
            </div>
          </section>

          <section className="panel sec" aria-labelledby="c4">
            <h2 id="c4"><span className="ix" aria-hidden="true">04</span>Payment <span className="sub"><LockIcon size={13} color="#57534E" />Encrypted, charged only when you place the order</span></h2>
            <div className="f"><label htmlFor="cn">Card number</label><input id="cn" className="in" inputMode="numeric" placeholder="1234 1234 1234 1234" style={{ fontFamily: "var(--font-mono)" }} /></div>
            <div className="f2">
              <div className="f"><label htmlFor="ex">Expiry</label><input id="ex" className="in" placeholder="MM / YY" style={{ fontFamily: "var(--font-mono)" }} /></div>
              <div className="f"><label htmlFor="cv">Security code</label><input id="cv" className="in" placeholder="3 digits" /></div>
            </div>
            <label className="cb"><input type="checkbox" defaultChecked />Billing address is the same as delivery</label>
            <button type="submit" className="sbtn place-btn">Place order · <span className="mono" style={{ fontSize: 16 }}>{money(total)}</span></button>
            <span className="terms-line">By placing your order you agree to the <a href="#">terms</a> and <a href="#">30-day return policy</a>.</span>
          </section>
        </form>

        <aside className="panel" aria-labelledby="os">
          <div className="ph"><h2 id="os">Order · {itemCount} items</h2></div>
          <div className="os-items">
            {items.map((l, i) => (
              <div className="os-item" key={l.sku} style={i === items.length - 1 ? { borderBottom: "1px solid #E4E3DF", paddingBottom: 16 } : undefined}>
                <span role="img" aria-label={l.name} className="thumb" style={{ background: l.photoBg }} />
                <span><b>{l.name}</b><br /><span className="var">{l.variant} · {l.qty}</span></span>
                <span className="mono" style={{ fontSize: 14 }}>{money(l.priceCents * l.qty)}</span>
              </div>
            ))}
            <div className="row" style={{ paddingTop: 14 }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="row"><span>{ship.summaryLabel}</span><span>{money(ship.cents)}</span></div>
            <div className="row"><span>Pennsylvania sales tax · 6%</span><span>{money(tax)}</span></div>
            <div className="tot"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <div className="hold-strip">
            <ClockIcon size={16} />
            <span>We hold {holdName} for 15 minutes while you check out. <span className="mono" aria-live="off">{leftMs > 0 ? `${fmtCountdown(leftMs)} left` : "Hold expired"}</span></span>
          </div>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}

/* X-07 — SysPaymentFailure. */
function DeclinedCheckout() {
  const router = useRouter();
  const { items, subtotal, tax } = useOrderMath();
  const total = subtotal + 980 + tax;
  const { expiry } = useHold();
  const heldUntil = useMemo(() => (expiry ? fmtClock(expiry) : "10:59 AM"), [expiry]);
  return (
    <>
      <header className="sheader">
        <div className="swrap n sheader-in">
          <Wordmark />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#57534E" }}>
            <LockIcon size={15} color="#57534E" />Secure checkout
          </span>
        </div>
      </header>
      <div className="swrap n txn">
        <section className="panel declined-panel">
          <h1>Payment</h1>
          <div role="alert" className="declined-alert">
            <span className="ic">
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="9" rx="1" /><path d="M1.5 6.5h13M4 10h3" /></svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b>Your bank declined the card. You haven’t been charged.</b>
              <span className="sub">Your apron and napkins are held for 15 minutes while you try again. Another card, or Apple Pay, usually works.</span>
            </span>
          </div>
          <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => { e.preventDefault(); router.push("/order/ORD-1053"); }}>
            <div>
              <label htmlFor="dcn" className="lbl" style={{ display: "block", marginBottom: 6 }}>Card number</label>
              <input id="dcn" className="in" defaultValue="4000 0000 0000 0002" aria-invalid="true" aria-describedby="cne" style={{ height: 50, fontFamily: "var(--font-mono)", fontWeight: 500 }} />
              <span id="cne" className="field-err">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#B91C1C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.8 14.6 13.5H1.4z" /><path d="M8 6.2v3.6M8 11.6v.4" /></svg>
                Declined by the bank · try a different card
              </span>
            </div>
            <div className="f2">
              <div><label htmlFor="dex" className="lbl" style={{ display: "block", marginBottom: 6 }}>Expiry</label><input id="dex" className="in" defaultValue="09 / 28" style={{ height: 50, fontFamily: "var(--font-mono)", fontWeight: 500 }} /></div>
              <div><label htmlFor="dcv" className="lbl" style={{ display: "block", marginBottom: 6 }}>CVC</label><input id="dcv" className="in" defaultValue="•••" style={{ height: 50, fontFamily: "var(--font-mono)", fontWeight: 500 }} /></div>
            </div>
            <button type="submit" className="sbtn" style={{ height: 56, marginTop: 4, fontSize: 16 }}>Try again · <span className="mono" style={{ fontSize: 15 }}>{money(total)}</span></button>
            <button type="button" className="sbtn ol" style={{ height: 50 }} onClick={() => router.push("/order/ORD-1053")}>Pay with Apple Pay</button>
          </form>
          <span className="held-line">
            <ClockIcon size={16} />
            <span>Held until <span className="mono">{heldUntil}</span>. After that, items go back on sale and your cart stays saved.</span>
          </span>
        </section>

        <aside className="panel" aria-labelledby="po">
          <div className="ph"><h2 id="po">Order</h2></div>
          <div style={{ padding: "10px 20px 22px", display: "flex", flexDirection: "column" }}>
            {items.map((l) => (
              <div className="row" key={l.sku}><span>{l.name} · {l.variant}</span><span>{money(l.priceCents * l.qty)}</span></div>
            ))}
            <div className="row" style={{ borderTop: "1px solid #E4E3DF", marginTop: 6, paddingTop: 12 }}><span>Shipping · USPS Ground</span><span>$9.80</span></div>
            <div className="row"><span>Sales tax</span><span>$6.00</span></div>
            <div className="tot"><span>Total</span><span>{money(total)}</span></div>
          </div>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
