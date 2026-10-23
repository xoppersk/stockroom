/* /admin/inventory/[sku] — X-03 (screens/SysInventoryZero.html) sold-out
 * state panel + stock detail for every other SKU.
 * Server component: the SKU is read from the real mapped catalog via
 * @/lib/shop/admin; the actor (getConsoleActor) gates the threshold
 * control. Unknown SKUs get the honest not-found panel — the fixture
 * build's canonical SM-TER fallback row is gone. */

import Link from "next/link";
import {
  getConsoleActor,
  listConsolePurchaseOrders,
  listConsoleSkus,
} from "@/lib/shop/admin";
import { toOpsSku } from "../_ops";
import SkuDetailClient from "./SkuDetailClient";

export default async function SkuDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: rawSku } = await params;
  const skuCode = decodeURIComponent(rawSku).toUpperCase();

  const [skus, purchaseOrders, actor] = await Promise.all([
    listConsoleSkus(),
    listConsolePurchaseOrders(),
    getConsoleActor(),
  ]);

  const opsSkus = skus.map((s) => toOpsSku(s, purchaseOrders));
  const product = opsSkus.find((s) => s.sku.toUpperCase() === skuCode);

  if (!product) {
    return (
      <div className="sr-page">
        <section className="panel" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 12px" }}>
            No SKU called <span className="mono">{skuCode}</span> is on the
            shelves.
          </p>
          <Link className="btn" href="/admin/inventory">
            ← Inventory
          </Link>
        </section>
      </div>
    );
  }

  const siblings = opsSkus.filter(
    (s) => s.sku !== product.sku && s.productName === product.productName,
  );
  const canSetThreshold = actor.role === "admin" || actor.role === "warehouse";

  return (
    <SkuDetailClient
      product={product}
      siblings={siblings}
      canSetThreshold={canSetThreshold}
    />
  );
}
