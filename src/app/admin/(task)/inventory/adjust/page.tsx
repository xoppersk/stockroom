/* O-02 — /admin/inventory/adjust (screens/StockAdjustment.html).
 * Server component: real SKUs + the real audit list arrive via
 * @/lib/shop/admin; the island records adjustments through the
 * adjustStock server action (adjust_inventory RPC). Product + reason
 * can be seeded from the URL (?sku=, ?reason=) — X-03's "Count the
 * shelf" links here that way. */

import { Suspense } from "react";
import { TaskBar } from "@/components/sr/TaskBar";
import {
  listConsoleAudit,
  listConsolePurchaseOrders,
  listConsoleSkus,
  todaysMovements,
} from "@/lib/shop/admin";
import { toOpsSku } from "@/app/admin/(shell)/inventory/_ops";
import AdjustClient from "./AdjustClient";

export default async function AdjustStockPage() {
  const [skus, audit, purchaseOrders, movements] = await Promise.all([
    listConsoleSkus(),
    listConsoleAudit(),
    listConsolePurchaseOrders(),
    todaysMovements(),
  ]);

  return (
    <>
      <TaskBar
        title="Adjust stock"
        closeLabel="Cancel"
        closeHref="/admin/inventory"
      />
      <Suspense fallback={null}>
        <AdjustClient
          skus={skus.map((s) => toOpsSku(s, purchaseOrders))}
          audit={audit.entries}
          movements={movements}
        />
      </Suspense>
    </>
  );
}
