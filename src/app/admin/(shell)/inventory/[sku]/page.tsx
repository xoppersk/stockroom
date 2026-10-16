"use client";

/* /admin/inventory/[sku] — X-03 (screens/SysInventoryZero.html) for SM-TER:
 * the sold-out StatePanel screen. Any other SKU renders a stock detail built
 * from the same layout using its fixture values. All numbers come from the
 * live store ledger merged over the fixtures, so an adjustment on O-02 or a
 * delivery received on O-01 is already true here. */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { StockLevel } from "@/components/sr/StockLevel";
import { LedgerLine } from "@/components/sr/LedgerLine";
import { listSkus } from "@/lib/api";
import { useShopState } from "@/lib/store";
import {
  availableOf,
  statusOf,
  toOpsSku,
  type OpsSku,
} from "../_ops";

const FALLBACK_TER: OpsSku = {
  sku: "SM-TER",
  name: "Stoneware mug — Terracotta",
  variant: "Terracotta",
  productName: "Stoneware mug",
  productSlug: "stoneware-mug",
  productStatus: "active",
  shelf: "C-02",
  onShelf: 2,
  committed: 2,
  reorderPoint: 18,
  incomingQty: 48,
  incomingDay: "Thu",
  incomingDateLabel: "Thu, Oct 8",
  incomingPo: "PO-0214",
  supplier: "Ashby Pottery",
  waitlist: 11,
};

const WEEKDAY_LONG: Record<string, string> = {
  Thu: "Thursday",
  Fri: "Friday",
  Wed: "Wednesday",
  Tue: "Tuesday",
  Mon: "Monday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function splitName(s: OpsSku): { product: string; variant: string } {
  return { product: s.productName, variant: s.variant };
}

export default function SkuDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: rawSku } = use(params);
  const skuCode = decodeURIComponent(rawSku).toUpperCase();
  const state = useShopState();
  const [backorders, setBackorders] = useState(false);

  const skus = useMemo(
    () => listSkus(state.products).map(toOpsSku),
    [state.products],
  );
  const product: OpsSku | undefined = useMemo(() => {
    const found = skus.find((s) => s.sku === skuCode);
    if (found) return found;
    return skuCode === "SM-TER" ? FALLBACK_TER : undefined;
  }, [skus, skuCode]);

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

  const { product: productName, variant } = splitName(product);
  const avail = availableOf(product);
  const status = statusOf(product);
  const soldOut = avail <= 0;
  const weekdayLong = product.incomingDay
    ? (WEEKDAY_LONG[product.incomingDay] ?? product.incomingDay)
    : undefined;
  const siblings = skus.filter(
    (s) => s.sku !== product.sku && splitName(s).product === productName,
  );
  const colourRows = [...siblings].sort((a, b) =>
    splitName(a).variant.localeCompare(splitName(b).variant),
  );
  colourRows.push(product);

  const title = soldOut
    ? `${productName}${variant ? `, ${variant}` : ""} is at zero.`
    : `${productName}${variant ? `, ${variant}` : ""} is at ${avail}.`;

  const lead = soldOut ? (
    <>
      The storefront now says{" "}
      {weekdayLong ? `“back ${weekdayLong}”` : "“sold out”"} and takes no new
      orders for it. {product.committed}{" "}
      {product.committed === 1 ? "order" : "orders"} already paid for{" "}
      {product.committed === 1 ? "is" : "are"} covered by the units still on
      the shelf.
    </>
  ) : (
    <>
      {product.onShelf} on the shelf, {product.committed} committed to paid
      orders, {avail} available for new orders.
      {product.incomingQty
        ? ` ${product.incomingQty} more arrive ${weekdayLong ?? ""} on ${product.incomingPo ?? "order"}.`
        : ""}
    </>
  );

  return (
    <>
      <section className="ops-state-band">
        <span className="ops-crumb">
          <Link href="/admin/inventory">Inventory</Link> / {productName}
        </span>
        <div className="ops-state-stamps">
          {soldOut ? (
            <Stamp tone="problem">Sold out</Stamp>
          ) : status === "count" ? (
            <Stamp tone="tape">Count</Stamp>
          ) : status === "low" ? (
            <Stamp tone="tape">Low</Stamp>
          ) : (
            <Stamp tone="paid">Healthy</Stamp>
          )}
          <span className="mono">
            {product.sku}
            {variant ? ` · ${variant}` : ""} · shelf {product.shelf ?? "—"}
          </span>
        </div>
        <div className="ops-state-grid">
          <div className="ops-state-copy">
            <h1 className="ops-state-title">{title}</h1>
            <p className="ops-state-lead">{lead}</p>
          </div>
          <div className="ops-state-actions">
            {soldOut ? (
              <>
                <Button
                  variant="tape"
                  aria-pressed={backorders}
                  onClick={() => setBackorders((b) => !b)}
                >
                  Allow backorders{weekdayLong ? ` until ${weekdayLong}` : ""}
                </Button>
                <Link
                  className="btn"
                  href={`/admin/inventory/adjust?sku=${product.sku}&reason=Counted`}
                >
                  Count the shelf
                </Link>
                {product.supplier && (
                  <Button variant="outline">
                    Message {product.supplier}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Link
                  className="btn tape"
                  href={`/admin/inventory/adjust?sku=${product.sku}`}
                >
                  Adjust stock
                </Link>
                <Link
                  className="btn"
                  href={`/admin/inventory/adjust?sku=${product.sku}&reason=Counted`}
                >
                  Count the shelf
                </Link>
                {product.supplier && (
                  <Button variant="outline">
                    Message {product.supplier}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <div className="sr-page">
        <div className="ops-zero-grid">
          <section className="panel" aria-label={product.name}>
            <div className="ops-stat-strip">
              <div className={`k${soldOut ? " zero" : ""}`}>
                <span className="k-label">Available</span>
                <b className={`v${soldOut ? " problem" : ""}`}>{avail}</b>
                <span className="k-sub">for new orders</span>
              </div>
              <div className="k">
                <span className="k-label">On hold</span>
                <b className="v">{product.committed}</b>
                <span className="k-sub">
                  {product.committed}{" "}
                  {product.committed === 1 ? "paid order" : "paid orders"}
                </span>
              </div>
              <div className="k">
                <span className="k-label">Arriving</span>
                <b className="v">{product.incomingQty ?? "—"}</b>
                <span className="mono">
                  {product.incomingQty
                    ? `${product.incomingDateLabel ?? product.incomingDay ?? ""} · ${product.incomingPo ?? ""}`
                    : "Nothing on order"}
                </span>
              </div>
              <div className="k">
                <span className="k-label">Waitlist</span>
                <b className={`v${product.waitlist ? " tape-ink" : ""}`}>
                  {product.waitlist ?? "—"}
                </b>
                <span className="k-sub">emailed when back</span>
              </div>
            </div>
          </section>

          {siblings.length > 0 ? (
            <section className="panel" aria-labelledby="ops-oc">
              <div className="ph">
                <h2 id="ops-oc">Other colours</h2>
              </div>
              <div className="ops-other-body">
                {colourRows.map((s) => {
                  const v = splitName(s).variant || s.name;
                  const st = statusOf(s);
                  return (
                    <StockLevel
                      key={s.sku}
                      name={v}
                      sku={s.sku}
                      available={availableOf(s)}
                      reorder={s.reorderPoint}
                      stampTone={
                        st === "out"
                          ? "problem"
                          : st === "healthy"
                            ? "paid"
                            : "tape"
                      }
                      stampLabel={
                        st === "out"
                          ? "Out"
                          : st === "count"
                            ? "Count"
                            : st === "low"
                              ? "Low"
                              : "Healthy"
                      }
                    />
                  );
                })}
              </div>
              <p className="ops-panel-foot-note">
                Shoppers on {variant || productName} see{" "}
                {siblings.map((s) => splitName(s).variant).join(" and ")}{" "}
                offered first.
              </p>
            </section>
          ) : (
            <section className="panel" aria-labelledby="ops-sd">
              <div className="ph">
                <h2 id="ops-sd">Stock</h2>
              </div>
              <div className="ops-other-body">
                <LedgerLine label="On shelf" value={String(product.onShelf)} />
                <LedgerLine label="Committed" value={String(product.committed)} />
                <LedgerLine label="Available" value={String(avail)} />
                <LedgerLine
                  label="Reorder at"
                  value={String(product.reorderPoint)}
                />
                <LedgerLine
                  label="Incoming"
                  value={
                    product.incomingQty
                      ? `${product.incomingQty} · ${product.incomingDay ?? ""}`
                      : "None"
                  }
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
