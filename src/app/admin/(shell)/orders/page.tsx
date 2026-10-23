/* C-02 Orders (+ X-02 empty) — exact build of screens/Orders.html and
   SysEmptyOrders.html.
   W-ORDERS rewire: async SERVER component. Reads are real:
   listConsoleOrders() (staff-RLS session reads) + derive.ordersSummary
   over the same list, handed to the OrdersClient island which keeps
   the drawn URL-filter/selection interaction. The CANON_ROWS fixture
   overlay is REMOVED. ?state=empty still renders the drawn X-02 empty
   state (a design state, no fixture data). */

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { listConsoleOrders } from "@/lib/shop/admin";
import { ordersSummary } from "@/lib/derive";
import { OrdersClient } from "./OrdersClient";
import "@/styles/console-core.css";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const params = await searchParams;
  if (params.state === "empty") return <EmptyOrders />;

  const orders = await listConsoleOrders();
  const summary = ordersSummary(orders);

  return (
    <Suspense fallback={null}>
      <OrdersClient orders={orders} summary={summary} />
    </Suspense>
  );
}

/* --------------------------------------------------------- X-02 empty */
function EmptyOrders() {
  return (
    <>
      <section className="cc-band cc-band-row">
        <h1 className="cc-h1">Orders</h1>
        <Button>Create order by hand</Button>
      </section>
      <div className="cc-listwrap" style={{ gap: 22 }}>
        <div className="cc-empty-grid">
          <section className="cc-panel cc-state-panel">
            <span className="cc-ico" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" /><path d="M6 5h4M6 7.5h4M6 10h2.5" /></svg>
            </span>
            <div className="cc-state-stack">
              <span className="cc-state-stamp"><Stamp tone="slate">0 orders</Stamp></span>
              <h2 className="cc-big">Your first order starts the ledger.</h2>
              <p className="cc-lead">When someone checks out, it lands here with payment, address and stock already checked. Anything that needs you goes to the top.</p>
              <div className="cc-state-actions">
                <Button variant="tape" href="/">Open the storefront</Button>
                <Button>Place a test order</Button>
              </div>
            </div>
          </section>

          <section className="cc-panel" aria-labelledby="rd">
            <div className="cc-ph">
              <h2 id="rd">Ready to sell</h2>
              <span className="mono cc-ph-mono">3 of 4 done</span>
            </div>
            <div className="cc-check-meter">
              <span className="cc-check-track"><i style={{ width: "75%" }} /></span>
            </div>
            <div className="cc-check-list">
              <div className="cc-ll"><span>Products live</span><i /><b>24 SKUs</b></div>
              <div className="cc-ll"><span>Card payments</span><i /><b style={{ color: "var(--paid)" }}>Connected</b></div>
              <div className="cc-ll"><span>Shipping rates</span><i /><b style={{ color: "var(--paid)" }}>USPS, UPS</b></div>
              <div className="cc-ll">
                <span>Same-day cut-off</span>
                <i />
                <Link href="/admin/settings" style={{ fontWeight: 600, color: "var(--tape-ink)" }}>Not set</Link>
              </div>
            </div>
          </section>
        </div>

        <section className="cc-panel" aria-label="Orders table, empty" style={{ overflowX: "auto" }}>
          <div className="cc-empty-table-head" role="row">
            <span role="columnheader">Order</span>
            <span role="columnheader">Placed</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="cc-right">Total</span>
          </div>
          <div className="cc-empty-table-body">No orders yet. Column headers stay so the shape is familiar on day two.</div>
        </section>
      </div>
    </>
  );
}
