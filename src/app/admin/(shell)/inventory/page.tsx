/* O-01 — /admin/inventory (screens/Inventory.html).
 * Server component: reads real SKUs, purchase orders and today's
 * movements via @/lib/shop/admin (session client, staff RLS) and
 * hands mapped view models to the client island. Every number
 * derives from @/lib/derive over that same data, so an adjustment on
 * O-02 or a delivery received here is reflected everywhere at once.
 * Filter state lives in the URL query (?view=, ?n=) per HANDOVER §10
 * (handled in the island). */

import { Suspense } from "react";
import {
  listConsolePurchaseOrders,
  listConsoleSkus,
  todaysMovements,
} from "@/lib/shop/admin";
import { inventorySummary } from "@/lib/derive";
import InventoryClient from "./InventoryClient";
import { toOpsMovements, toOpsPos, toOpsSku } from "./_ops";

export default async function InventoryPage() {
  const [skus, purchaseOrders, movements] = await Promise.all([
    listConsoleSkus(),
    listConsolePurchaseOrders(),
    todaysMovements(),
  ]);

  const arrivingQty = purchaseOrders
    .filter((po) => po.status === "open")
    .reduce((sum, po) => sum + po.lines.reduce((s, l) => s + l.qty, 0), 0);
  const summary = inventorySummary(skus, arrivingQty);

  return (
    <Suspense fallback={null}>
      <InventoryClient
        skus={skus.map((s) => toOpsSku(s, purchaseOrders))}
        pos={toOpsPos(purchaseOrders)}
        movements={toOpsMovements(movements)}
        summary={summary}
      />
    </Suspense>
  );
}
