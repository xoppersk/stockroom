/* O-04 — /admin/customers/[slug] (screens/CustomerDetail.html).
 * Slug = customer uuid (ruling 9). Async server component:
 * getConsoleCustomer(uuid) maps the real record (orders / addresses /
 * notes); the hold panel is built from the last order's REAL hold via
 * getConsoleOrder — no fixture hold copy. Interactive notes + tags
 * live in CustomerDetailClient. */

import Link from "next/link";
import { getConsoleCustomer, getConsoleOrder } from "@/lib/shop/admin";
import CustomerDetailClient, { type CustomerHoldVm } from "./CustomerDetailClient";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const customer = await getConsoleCustomer(slug);

  if (!customer) {
    return (
      <div className="sr-page">
        <section className="panel" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 12px" }}>
            No customer record for <span className="mono">{slug}</span>.
          </p>
          <Link className="btn" href="/admin/customers">
            ← Customers
          </Link>
        </section>
      </div>
    );
  }

  let hold: CustomerHoldVm | null = null;
  if (customer.lastOrder) {
    const lastOrder = await getConsoleOrder(customer.lastOrder.orderId);
    if (lastOrder?.hold) {
      hold = {
        orderId: lastOrder.id,
        stamp: lastOrder.hold.title,
        title:
          lastOrder.placedDay === "today"
            ? "Today’s order is on hold."
            : "This order is on hold.",
        text: `${lastOrder.hold.reason}${lastOrder.hold.detail ? ` ${lastOrder.hold.detail}` : ""}`,
      };
    }
  }

  return <CustomerDetailClient customer={customer} hold={hold} />;
}
