/* Order detail — W-ORDERS rewire.
   Was: three hard-coded faces keyed by id (ORD-1048 count form,
   ORD-1046 simulated retry, ORD-1036 fixture refund limits) with
   every other id silently showing ORD-1048.
   Now: an async SERVER component fetching the VIEWED order via
   getConsoleOrder(param) + the real actor + real SKU stock
   (listConsoleSkus), handed to the OrderDetailClient island. The
   drawn panels are generic over the viewed order: stage advance →
   admin-actions.advanceOrderStage; cancel → cancelOrder; refund →
   refundOrder (issue_order_refund RPC, rejections surface in the
   X-06-style panel, ruling 6); note → addOrderNote; history from
   order_events (Order.history); the recount form (ruling 5,
   recountOrderLine) shows only when a line's available < qty.
   Failed-payment orders render the X-04 face with real status +
   events and only real actions (note / cancel / refund-when-paid) —
   no simulated retry capture (ruling 6). Unknown ids render an
   honest not-found panel instead of the canonical fixture order. */

import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { getConsoleActor, getConsoleOrder, listConsoleSkus } from "@/lib/shop/admin";
import { availableOf } from "@/lib/derive";
import { OrderDetailClient, type SkuStock } from "./OrderDetailClient";
import "@/styles/console-core.css";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getConsoleOrder(id);

  if (!order) {
    return (
      <>
        <section className="cc-task-band">
          <div className="cc-band-stack">
            <Link href="/admin/orders" className="cc-backlink">← Orders</Link>
            <div className="cc-title-row">
              <h1 className="mono cc-h1-mono">{id}</h1>
            </div>
            <span className="cc-sub">This order isn’t in the orders table.</span>
          </div>
        </section>
        <div className="sr-page">
          <section className="cc-panel" style={{ padding: "22px 20px" }}>
            <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--ink-2)" }}>
              No order numbered {id} came back from the database. It may have been
              typed differently, or it hasn’t been placed yet.
            </p>
            <Button href="/admin/orders">Back to orders</Button>
          </section>
        </div>
      </>
    );
  }

  const [actor, skus] = await Promise.all([getConsoleActor(), listConsoleSkus()]);
  const skuStock: Record<string, SkuStock> = {};
  for (const s of skus) {
    skuStock[s.sku] = {
      available: availableOf(s),
      onShelf: s.onShelf,
      committed: s.committed,
      shelf: s.shelf,
    };
  }

  return <OrderDetailClient order={order} actor={actor} skuStock={skuStock} />;
}
