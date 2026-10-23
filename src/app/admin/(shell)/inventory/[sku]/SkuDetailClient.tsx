"use client";

/* SKU detail client island — markup preserved from the fixture build
   (X-03 sold-out state panel + stock panels); data arrives as props
   from the server page.
 *
 * THRESHOLD CONTROL (required deliverable): the "Reorder at" surface
   is a real editor wired to setVariantThreshold →
 * set_low_stock_threshold RPC (00011, LIVE; admin/warehouse only).
 * Enabled only for admin/warehouse actors; support sees it disabled
 * with the role note — the RPC remains the enforcer and its
 * rejections surface verbatim.
 *
 * "Allow backorders" has no DB column / action in the contract: it
 * renders the product's mapped value, disabled (adaptation A-SKU-1).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { StockLevel } from "@/components/sr/StockLevel";
import { LedgerLine } from "@/components/sr/LedgerLine";
import { setVariantThreshold } from "@/lib/shop/admin-actions";
import { availableOf, statusOf, type OpsSku } from "../_ops";

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

/* ---------------- threshold editor ---------------- */

function ThresholdEditor({
  variantId,
  sku,
  current,
  canEdit,
}: {
  variantId: string;
  sku: string;
  current: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== String(current);

  function save() {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0 || String(n) !== value.trim()) {
      setError("Enter a whole number, 0 or more.");
      setSaved(false);
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await setVariantThreshold(variantId, n);
      if (!res.ok) {
        setError(res.reason);
        setSaved(false);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        aria-label={`Reorder point for ${sku}`}
        className="in mono"
        style={{ width: 72, textAlign: "right" }}
        inputMode="numeric"
        value={value}
        disabled={!canEdit || pending}
        onChange={(e) => {
          setValue(e.target.value.replace(/[^0-9]/g, ""));
          setSaved(false);
          setError("");
        }}
      />
      <button
        type="button"
        className="btn"
        disabled={!canEdit || pending || !dirty}
        onClick={save}
      >
        Set
      </button>
      {!canEdit ? (
        <span style={{ fontSize: 12, color: "var(--slate)" }}>Warehouse and admin only</span>
      ) : saved && !dirty ? (
        <span role="status" style={{ fontSize: 12, color: "var(--paid)", fontWeight: 600 }}>Saved</span>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--problem)" }}>{error}</span>
      ) : null}
    </span>
  );
}

/* ---------------- page island ---------------- */

type Props = {
  product: OpsSku;
  siblings: OpsSku[];
  canSetThreshold: boolean;
};

export default function SkuDetailClient({ product, siblings, canSetThreshold }: Props) {
  const { product: productName, variant } = splitName(product);
  const avail = availableOf(product);
  const status = statusOf(product);
  const soldOut = avail <= 0;
  const weekdayLong = product.incomingDay
    ? (WEEKDAY_LONG[product.incomingDay] ?? product.incomingDay)
    : undefined;
  const colourRows = [...siblings].sort((a, b) =>
    splitName(a).variant.localeCompare(splitName(b).variant),
  );
  colourRows.push(product);
  const thresholdVariantId = product.variantId ?? product.sku;

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
                  aria-pressed={Boolean(product.backorder)}
                  disabled
                  title="Back-order setting isn't stored yet"
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
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 12, marginTop: 4 }}>
                  <LedgerLine
                    label={`Reorder point — ${variant || product.sku}`}
                    value={
                      <ThresholdEditor
                        variantId={thresholdVariantId}
                        sku={product.sku}
                        current={product.reorderPoint}
                        canEdit={canSetThreshold}
                      />
                    }
                  />
                </div>
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
                  value={
                    <ThresholdEditor
                      variantId={thresholdVariantId}
                      sku={product.sku}
                      current={product.reorderPoint}
                      canEdit={canSetThreshold}
                    />
                  }
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
