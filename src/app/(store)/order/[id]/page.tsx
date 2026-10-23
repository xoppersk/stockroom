/* S-06 — Order page, REAL order read (src/lib/shop/orders).
   Visible to: the signed-in owner (RLS, created_by — post-00011), staff
   (RLS), or the guest whose HttpOnly cart token matches the order's
   guest_token. Anyone else gets the honest not-found state — no fixture
   receipt, no order data leaked. Payment state is stated plainly:
   orders land as payment "pending" because online payment isn't
   enabled yet (gap 4). */
import Link from "next/link";
import { Suspense } from "react";
import { money } from "@/lib/format";
import { getOrderForViewer } from "@/lib/shop/orders";
import { StoreFooter, StoreSlimHeader } from "../../_components/chrome";


export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <OrderInner params={params} />
    </Suspense>
  );
}

async function OrderInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderForViewer(id);

  if (!order) {
    return (
      <>
        <StoreSlimHeader right={<Link href="/" style={{ fontSize: 14, fontWeight: 500 }}>Back to the shop</Link>} />
        <div className="swrap n conf-grid">
          <section className="conf-main">
            <div className="panel" style={{ padding: 24 }}>
              <h1 style={{ marginTop: 0 }}>We can’t show that order</h1>
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>
                Either it doesn’t exist, or it isn’t yours to see. Guests see an order in the browser where they placed it; signed-in customers see their orders under <Link href="/account/orders">your orders</Link>.
              </p>
              <Link href="/" className="sbtn ol">Back to the shop</Link>
            </div>
          </section>
        </div>
        <StoreFooter variant="slim" />
      </>
    );
  }

  const placed = new Date(order.createdAt);
  const placedLabel = placed.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const pendingPayment = order.paymentStatus === "pending";

  return (
    <>
      <StoreSlimHeader right={<Link href="/" style={{ fontSize: 14, fontWeight: 500 }}>Back to the shop</Link>} />
      <div className="swrap n conf-grid">
        <section className="conf-main">
          <div className="conf-head">
            <span className="conf-oid">
              <span className="tick">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              </span>
              <span className="mono">{order.orderNumber}</span>
            </span>
            <h1>Thank you — your order is recorded.</h1>
            <p className="conf-lede">
              {pendingPayment ? (
                <>Your order is <b>pending payment</b>: online payment isn’t enabled for this shop yet, so nothing has been charged. We’ll email you to arrange payment and confirm delivery before anything ships.</>
              ) : (
                <>Payment status: <b>{order.paymentStatus}</b>. We’ve set your items aside and will email tracking once the label prints.</>
              )}
            </p>
          </div>

          <ol aria-label="What happens next" className="panel steps">
            <li className="st"><i style={{ background: "#15803D" }} /><b>Order recorded · {order.status}</b><span className="mono">{placedLabel}</span></li>
            <li className="st"><i style={{ background: pendingPayment ? "#D97706" : "#15803D" }} /><b>{pendingPayment ? "Payment pending" : "Paid"}</b><span className="mono">{pendingPayment ? "We’ll email you" : order.paymentStatus}</span></li>
            <li className="st"><i style={{ background: "repeating-linear-gradient(135deg, #E4E3DF 0 5px, #F2F1EE 5px 10px)" }} /><b>Fulfilment</b><span className="mono">{order.trackingNumber ? `Tracking ${order.trackingNumber}` : "After payment is arranged"}</span></li>
          </ol>

          <div className="conf-ctas">
            <Link href="/account/orders" className="sbtn">See your orders</Link>
            <Link href="/" className="sbtn ol">Keep shopping</Link>
          </div>
        </section>

        <aside className="panel" aria-labelledby="rc">
          <div className="ph"><h2 id="rc">Receipt</h2><span className="mono" style={{ fontSize: 12, color: "#6F6A64" }}>{order.orderNumber}</span></div>
          <div className="receipt-body">
            {order.items.map((item) => (
              <div className="row" key={item.id}><span>{item.productTitle} · {item.variantTitle} × {item.quantity}</span><span>{money(item.lineTotalCents)}</span></div>
            ))}
            <div className="row" style={{ borderTop: "1px dashed #D6D5D0", paddingTop: 12, marginTop: 6 }}><span>Subtotal</span><span>{money(order.subtotalCents)}</span></div>
            {order.discountCents > 0 && (
              <div className="row"><span>Discount{order.discountCode ? ` · ${order.discountCode}` : ""}</span><span>−{money(order.discountCents)}</span></div>
            )}
            {order.shippingCents > 0 && (
              <div className="row"><span>Shipping</span><span>{money(order.shippingCents)}</span></div>
            )}
            {order.taxCents > 0 && (
              <div className="row"><span>Sales tax</span><span>{money(order.taxCents)}</span></div>
            )}
            <div className="tot"><span>{pendingPayment ? "Due" : "Paid"}</span><span>{money(order.totalCents)}</span></div>
          </div>
          <div className="receipt-foot">
            Order status: <b>{order.status}</b> · payment: <b>{order.paymentStatus}</b>.<br />
            Questions? Reply to the receipt email, or call the workshop <span style={{ whiteSpace: "nowrap" }}>10–6</span>.
          </div>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
