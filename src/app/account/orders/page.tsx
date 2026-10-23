/* Customer order history — the signed-in customer's OWN orders only.
   The query runs as the user through the SSR client (src/lib/shop/orders
   → getMyOrders): RLS does the filtering (post-00011 orders_customer_read
   on created_by = auth.uid()); no service role, no superset filtering.
   Until migration 00011 is applied live, the same query honestly returns
   nothing — rendered as an explicit empty state, never fixture orders.
   Chrome (slim header/footer + wrap) comes from src/app/account/layout.tsx
   (W-AUTH) — this page renders content only. */
import Link from "next/link";
import { money } from "@/lib/format";
import { getMyOrders } from "@/lib/shop/orders";


export default async function AccountOrdersPage() {
  const { signedIn, orders } = await getMyOrders();

  return (
    <div style={{ paddingTop: 36, paddingBottom: 48 }}>
      <h1 style={{ marginTop: 0 }}>Your orders</h1>

      {!signedIn ? (
        <div className="panel" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            You’re not signed in. <Link href="/account/login">Sign in</Link> to see the orders placed with your account. Guest orders stay visible in the browser where they were placed.
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="panel" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            No orders yet on this account. When you check out while signed in, your orders will be listed here. <Link href="/">Start shopping</Link>
          </p>
        </div>
      ) : (
        <div className="panel">
          {orders.map((o) => {
            const placed = new Date(o.createdAt).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            });
            const summary = o.items.slice(0, 2).map((i) => `${i.productTitle} · ${i.variantTitle} × ${i.quantity}`).join("; ");
            const extra = o.items.length > 2 ? `; +${o.items.length - 2} more` : "";
            return (
              <div className="it" key={o.id} style={{ gridTemplateColumns: "1fr auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                  <b className="it-name">
                    <Link href={`/order/${o.id}`} className="mono" style={{ color: "inherit" }}>{o.orderNumber}</Link>
                    {" "}· {placed}
                  </b>
                  <span className="it-var">{summary}{extra}</span>
                  <span className="note">Status: {o.status} · payment: {o.paymentStatus}{o.trackingNumber ? ` · tracking ${o.trackingNumber}` : ""}</span>
                </div>
                <b className="mono" style={{ textAlign: "right", fontSize: 15, fontWeight: 600 }}>{money(o.totalCents)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
