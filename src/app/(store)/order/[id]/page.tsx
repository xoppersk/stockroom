/* S-06 — Order confirmation. Canonical: ORD-1053, Nia Okoye.
   "Thank you, Nia. It ships today.", 3-step progress, receipt $115.80,
   change delivery until 1:30 PM. Slim footer. Copy from
   screens/StoreConfirmation.html. */
import Link from "next/link";
import { Suspense } from "react";
import { money } from "@/lib/format";
import { StoreFooter, StoreSlimHeader } from "../../_components/chrome";

const RECEIPT = [
  { label: "Linen apron · Charcoal", cents: 6400 },
  { label: "Linen napkins, set of 4 · Natural", cents: 3600 },
];
const SHIPPING = 980;
const TAX = 600;
const TOTAL = 11580;

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <OrderInner params={params} />
    </Suspense>
  );
}

async function OrderInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = id.toUpperCase();
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
              <span className="mono">{orderId}</span>
            </span>
            <h1>Thank you, Nia. It ships today.</h1>
            <p className="conf-lede">We’ve taken <b>{money(TOTAL)}</b> and set your apron and napkins aside. A receipt is on its way to nia.okoye@sevynlabs.io, and tracking follows once the label prints.</p>
          </div>

          <ol aria-label="What happens next" className="panel steps">
            <li className="st"><i style={{ background: "#15803D" }} /><b>Paid and reserved</b><span className="mono">Today, 10:44 AM</span></li>
            <li className="st"><i style={{ background: "#D97706" }} /><b>Packed and shipped</b><span className="mono">Before 2:00 PM today</span></li>
            <li className="st"><i style={{ background: "repeating-linear-gradient(135deg, #E4E3DF 0 5px, #F2F1EE 5px 10px)" }} /><b>Arrives</b><span className="mono">Fri, Oct 9 – Mon, Oct 12</span></li>
          </ol>

          <div className="conf-ctas">
            <a href="#" className="sbtn">Save your details for next time</a>
            <Link href="/collections/kitchen-textiles" className="sbtn ol">Keep shopping</Link>
          </div>

          <div className="change-box">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 14.5s5-4.4 5-8.3a5 5 0 0 0-10 0c0 3.9 5 8.3 5 8.3z" /><circle cx="8" cy="6.2" r="1.8" /></svg>
            <span>Need to change the address? You can until the label prints, around <span className="mono">1:30 PM</span>.</span>
            <a href="#">Change delivery</a>
          </div>
        </section>

        <aside className="panel" aria-labelledby="rc">
          <div className="ph"><h2 id="rc">Receipt</h2><span className="mono" style={{ fontSize: 12, color: "#6F6A64" }}>{orderId}</span></div>
          <div className="receipt-body">
            {RECEIPT.map((r) => (
              <div className="row" key={r.label}><span>{r.label}</span><span>{money(r.cents)}</span></div>
            ))}
            <div className="row" style={{ borderTop: "1px dashed #D6D5D0", paddingTop: 12, marginTop: 6 }}><span>Shipping · USPS Ground</span><span>{money(SHIPPING)}</span></div>
            <div className="row"><span>Sales tax</span><span>{money(TAX)}</span></div>
            <div className="tot"><span>Paid</span><span>{money(TOTAL)}</span></div>
          </div>
          <div className="receipt-ship">
            <b className="k">Shipping to</b>
            <span>Nia Okoye<br />418 Christian Street, Apt 2<br />Philadelphia, PA 19147</span>
          </div>
          <div className="receipt-foot">Questions? Reply to the receipt email, or call the workshop <span style={{ whiteSpace: "nowrap" }}>10–6</span>.</div>
        </aside>
      </div>
      <StoreFooter variant="slim" />
    </>
  );
}
