"use client";
/* S-05 — Checkout (one page), REAL cart + REAL order creation.
   The summary is the server cart (live variant prices, validated
   discount). Delivery choices are fulfilment preferences only —
   create_checkout_session records shipping_total = 0 / tax_total = 0,
   so the total is exactly subtotal − discount, as the server computes.
 *
 * Payment honesty (gap 4 — no Stripe keys configured): there is NO card
 * form and NO fake payment step. The page states plainly that online
 * payment isn't enabled yet; placing the order records it as PENDING
 * via POST /api/checkout and routes to /order/[id].
 * The old ?state=declined fixture (X-07) is gone with the fake card form. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/format";
import type { CartView } from "@/lib/shop/cart";
import { placeholderBg } from "@/lib/shop/view";
import { StoreFooter, StoreSlimHeader } from "../_components/chrome";
import { LockIcon } from "../_components/ui";

const FULFILMENT = [
  { id: "ship", name: "Ship it to me", sub: "Shipping is calculated at fulfilment and confirmed by email before anything is charged.", summaryLabel: "Shipping" },
  { id: "pickup", name: "Pick up at the workshop", sub: "2214 Fitzwater St · we'll email when it's ready. Always free.", summaryLabel: "Pickup · workshop" },
] as const;

export default function CheckoutClient({
  initialCart,
  serviceConfigured,
}: {
  initialCart: CartView | null;
  serviceConfigured: boolean;
}) {
  const router = useRouter();
  const [fulfilment, setFulfilment] = useState<string>("ship");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = initialCart?.lines ?? [];
  const subtotal = initialCart?.subtotalCents ?? 0;
  const discount = initialCart?.discountCents ?? 0;
  const total = initialCart?.totalCents ?? 0;
  const itemCount = initialCart?.itemCount ?? 0;
  const fulfil = FULFILMENT.find((f) => f.id === fulfilment) ?? FULFILMENT[0];

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (placing) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
      if (!res.ok || !json.orderId) {
        setError(json.error ?? "Checkout failed. Please try again.");
        setPlacing(false);
        return;
      }
      window.dispatchEvent(new Event("stockroom:cart-changed"));
      router.push(`/order/${json.orderId}`);
    } catch {
      setError("Checkout failed. Please check your connection and try again.");
      setPlacing(false);
    }
  };

  if (!serviceConfigured) {
    return (
      <>
        <StoreSlimHeader right={<Link href="/cart" style={{ fontSize: 14, fontWeight: 500 }}>Back to cart</Link>} />
        <div className="swrap n txn wide" style={{ paddingTop: 36 }}>
          <section className="panel sec" aria-labelledby="ce">
            <h2 id="ce">Checkout isn’t available in this environment</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              Placing an order needs the shop’s server configuration, which isn’t present here — no order was created and nothing was charged. Checkout works on the live site.
            </p>
          </section>
        </div>
        <StoreFooter variant="slim" />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <StoreSlimHeader right={<Link href="/cart" style={{ fontSize: 14, fontWeight: 500 }}>Back to cart</Link>} />
        <div className="swrap n txn wide" style={{ paddingTop: 36 }}>
          <section className="panel sec" aria-labelledby="ce">
            <h2 id="ce">Your cart is empty</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              There’s nothing to check out yet. <Link href="/">Keep shopping</Link> — your cart is saved to your account (or this browser, as a guest) while you browse.
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
        <form className="co-form" onSubmit={(e) => void placeOrder(e)}>
          <section className="panel sec" aria-labelledby="c1">
            <h2 id="c1"><span className="ix" aria-hidden="true">01</span>Contact</h2>
            <div className="f"><label htmlFor="em">Email for your receipt and tracking</label><input id="em" className="in" type="email" required placeholder="you@example.com" autoComplete="email" /></div>
            <p className="note" style={{ margin: 0 }}>We use this only for this order’s receipt and updates. (Order records themselves are tied to your account or guest cart.)</p>
          </section>

          <section className="panel sec" aria-labelledby="c2">
            <h2 id="c2"><span className="ix" aria-hidden="true">02</span>Delivery</h2>
            <div className="f2">
              <div className="f"><label htmlFor="fn">First name</label><input id="fn" className="in" autoComplete="given-name" /></div>
              <div className="f"><label htmlFor="ln">Last name</label><input id="ln" className="in" autoComplete="family-name" /></div>
            </div>
            <div className="f"><label htmlFor="ad">Street address</label><input id="ad" className="in" autoComplete="street-address" /></div>
            <div className="f3">
              <div className="f"><label htmlFor="ci">City</label><input id="ci" className="in" autoComplete="address-level2" /></div>
              <div className="f"><label htmlFor="stt">State</label><input id="stt" className="in" autoComplete="address-level1" /></div>
              <div className="f"><label htmlFor="zp">ZIP</label><input id="zp" className="in" autoComplete="postal-code" style={{ fontFamily: "var(--font-mono)" }} /></div>
            </div>
            <p className="note" style={{ margin: 0 }}>Delivery details are confirmed with you by email when the order is fulfilled — they aren’t charged or stored with the payment (there is none yet).</p>
          </section>

          <section className="panel sec" aria-labelledby="c3">
            <h2 id="c3"><span className="ix" aria-hidden="true">03</span>How it gets to you</h2>
            <div role="radiogroup" aria-labelledby="c3" className="ship-group">
              {FULFILMENT.map((o) => (
                <label key={o.id} className={`opt${fulfilment === o.id ? " on" : ""}`}>
                  <input type="radio" name="sh" checked={fulfilment === o.id} onChange={() => setFulfilment(o.id)} />
                  <span><b>{o.name}</b><br /><span className="opt-sub">{o.sub}</span></span>
                  <b>{o.id === "pickup" ? "Free" : "At fulfilment"}</b>
                </label>
              ))}
            </div>
          </section>

          <section className="panel sec" aria-labelledby="c4">
            <h2 id="c4"><span className="ix" aria-hidden="true">04</span>Payment <span className="sub"><LockIcon size={13} color="#57534E" />Not enabled yet</span></h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
              <b>Online payment isn’t enabled for this shop yet.</b> Placing your order records it as <b>pending</b> — nothing is charged now. We’ll email you to arrange payment and confirm {fulfilment === "pickup" ? "your pickup" : "delivery"} before anything ships.
            </p>
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: "#B91C1C" }}>{error}</p>
            )}
            <button type="submit" className="sbtn place-btn" disabled={placing}>
              {placing ? "Placing your order…" : <>Place order · <span className="mono" style={{ fontSize: 16 }}>{money(total)}</span></>}
            </button>
            <span className="terms-line">By placing your order you agree to the <a href="#">terms</a> and <a href="#">30-day return policy</a>. The final total is computed by our server from live prices — never from your browser — and confirmed on your order page.</span>
          </section>
        </form>

        <aside className="panel" aria-labelledby="os">
          <div className="ph"><h2 id="os">Order · {itemCount} items</h2></div>
          <div className="os-items">
            {items.map((l, i) => (
              <div className="os-item" key={l.itemId} style={i === items.length - 1 ? { borderBottom: "1px solid #E4E3DF", paddingBottom: 16 } : undefined}>
                <span role="img" aria-label={l.productTitle} className="thumb" style={{ background: placeholderBg(l.productSlug) }} />
                <span><b>{l.productTitle}</b><br /><span className="var">{l.variantTitle} · {l.quantity}</span></span>
                <span className="mono" style={{ fontSize: 14 }}>{money(l.lineTotalCents)}</span>
              </div>
            ))}
            <div className="row" style={{ paddingTop: 14 }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {discount > 0 && (
              <div className="row"><span>Discount{initialCart?.discountCode ? ` · ${initialCart.discountCode}` : ""}</span><span>−{money(discount)}</span></div>
            )}
            <div className="row"><span>{fulfil.summaryLabel}</span><span>At fulfilment</span></div>
            <div className="tot"><span>Total due</span><span>{money(total)}</span></div>
          </div>
          <div className="hold-strip">
            <span>Your items are reserved while the shop confirms stock at checkout — the server re-checks every line before the order is created.</span>
          </div>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
