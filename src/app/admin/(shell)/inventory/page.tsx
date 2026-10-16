"use client";

/* O-01 — /admin/inventory (screens/Inventory.html).
 * Every number derives from the live store ledger: SKUs come from
 * listSkus(state.products), counts from inventorySummary() over that same
 * list, so an adjustment on O-02 or a delivery received here is reflected
 * on every Operations screen at once. Filter state lives in the URL query
 * (?view=, ?n=) per HANDOVER §10. */

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import {
  inventorySummary,
  listPurchaseOrders,
  listSkus,
  todaysMovements,
} from "@/lib/api";
import { useShop, useShopState } from "@/lib/store";
import { num } from "@/lib/format";
import {
  FALLBACK_MOVEMENTS,
  FALLBACK_POS,
  availableOf,
  statusOf,
  toOpsMovements,
  toOpsPos,
  toOpsSku,
  type OpsSku,
} from "./_ops";

type View = "below" | "zero" | "count" | "all";

const VIEW_LABEL: Record<View, string> = {
  below: "SKUs below reorder point",
  zero: "SKUs at zero",
  count: "SKUs with a count pending",
  all: "All SKUs",
};

function inView(s: OpsSku, view: View): boolean {
  if (view === "all") return true;
  if (view === "zero") return availableOf(s) <= 0;
  if (view === "count") return Boolean(s.countPending);
  return availableOf(s) < s.reorderPoint;
}

function InventoryInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const shop = useShop();
  const state = useShopState();

  const view = (params.get("view") as View | null) ?? "below";
  const shown = Math.max(8, Number(params.get("n") ?? 8) || 8);

  const liveSkus = useMemo(
    () => listSkus(state.products),
    [state.products],
  );
  const skus = useMemo(() => liveSkus.map(toOpsSku), [liveSkus]);
  const summary = useMemo(
    () => inventorySummary(liveSkus),
    [liveSkus],
  );
  const pos = useMemo(() => {
    const list = toOpsPos(listPurchaseOrders());
    return list.length > 0 ? list : FALLBACK_POS;
  }, []);
  const movements = useMemo(() => {
    const list = toOpsMovements(todaysMovements());
    return list.length > 0 ? list : FALLBACK_MOVEMENTS;
  }, []);

  const received = useMemo(
    () => new Set(state.receivedPoIds),
    [state.receivedPoIds],
  );
  const openPos = pos.filter((p) => !received.has(p.id));
  const arriving = openPos.reduce((a, p) => a + p.units, 0);
  const supplierCount = new Set(openPos.map((p) => p.supplier)).size;

  /* The table never lists archived products (api.inventorySummary tallies
     exclude them the same way). The Below-reorder view follows the screen's
     drawn order for its first rows (the pattern dashboardData uses for the
     watch panel); other views keep fixture order. */
  const DRAWN_ORDER = [
    "SM-TER", "LA-CHR", "CT-NAT", "NP-4C",
    "WT-RST", "WT-OAT", "EC-WHT", "SM-MOS",
  ];
  const tableSkus = skus.filter((s) => s.productStatus !== "archived");
  let rows = tableSkus.filter((s) => inView(s, view));
  if (view === "below") {
    rows = [...rows].sort((a, b) => {
      const ia = DRAWN_ORDER.indexOf(a.sku);
      const ib = DRAWN_ORDER.indexOf(b.sku);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  const visible = rows.slice(0, shown);

  function setQuery(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <>
      <section className="ops-hero">
        <div className="ops-hero-grid">
          <div className="ops-hero-lead">
            <h1 className="ops-h1">Inventory</h1>
            <span className="ops-sub" style={{ maxWidth: 440 }}>
              {num(summary.onHand)} units on the shelves across{" "}
              {num(summary.totalSkus)} SKUs. {num(summary.committed)} are
              committed to open orders, {num(arriving)} arrive this week from{" "}
              {supplierCount} suppliers, and {summary.belowReorder} SKUs are
              below their reorder point.
            </span>
          </div>
          <div className="ops-stats" aria-hidden="true">
            <div className="ops-stat">
              <div className="sv cond">{num(summary.onHand)}</div>
              <div className="sl">units on the shelves</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond">{num(summary.committed)}</div>
              <div className="sl">committed</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond">{num(arriving)}</div>
              <div className="sl">arrive this week</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond tape-ink">{summary.belowReorder}</div>
              <div className="sl">below reorder point</div>
            </div>
          </div>
          <div className="ops-hero-actions">
            <Link href="/admin/inventory/adjust?reason=Counted" className="btn">
              Start a shelf count
            </Link>
            <Link href="/admin/inventory/adjust" className="btn tape">
              Adjust stock
            </Link>
          </div>
        </div>
        <div className="ops-tabs" role="tablist" aria-label="Inventory views">
          <button
            className="flt"
            role="tab"
            aria-selected={view === "below"}
            onClick={() => setQuery({ view: "below", n: null })}
          >
            Below reorder <span className="cnt tape">{summary.belowReorder}</span>
          </button>
          <button
            className="flt"
            role="tab"
            aria-selected={view === "zero"}
            onClick={() => setQuery({ view: "zero", n: null })}
          >
            At zero <span className="cnt problem">{summary.atZero}</span>
          </button>
          <button
            className="flt"
            role="tab"
            aria-selected={view === "count"}
            onClick={() => setQuery({ view: "count", n: null })}
          >
            Count pending <span className="cnt flat">{summary.countPending}</span>
          </button>
          <button
            className="flt"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setQuery({ view: "all", n: null })}
          >
            All SKUs <span className="cnt flat">{num(summary.totalSkus)}</span>
          </button>
        </div>
      </section>

      <div className="sr-page">
        <div className="ops-inv-grid">
          <section className="panel" aria-label={VIEW_LABEL[view]}>
            <div className="ops-scroll">
              <div role="table" aria-label={VIEW_LABEL[view]}>
                <div role="row" className="ir head">
                  <span role="columnheader">SKU</span>
                  <span role="columnheader">Shelf</span>
                  <span role="columnheader" className="n">
                    On shelf
                  </span>
                  <span role="columnheader" className="n">
                    Committed
                  </span>
                  <span role="columnheader" className="n">
                    Available
                  </span>
                  <span role="columnheader" className="n">
                    Reorder at
                  </span>
                  <span role="columnheader">Incoming</span>
                  <span role="columnheader">Status</span>
                </div>
                {visible.map((s) => {
                  const avail = availableOf(s);
                  const status = statusOf(s);
                  const pct =
                    avail <= 0
                      ? 2
                      : Math.min(
                          100,
                          Math.round((avail / Math.max(1, s.reorderPoint)) * 100),
                        );
                  const meterColor =
                    status === "out"
                      ? "var(--problem)"
                      : status === "healthy"
                        ? "var(--paid)"
                        : "var(--tape)";
                  return (
                    <div
                      role="row"
                      className={`ir${s.countPending ? " count-row" : ""}`}
                      key={s.sku}
                    >
                      <span role="cell">
                        <Link
                          className="sku-name"
                          href={`/admin/inventory/${s.sku}`}
                        >
                          <b>{s.displayName ?? s.name}</b>
                          <span className="mono sku-code">
                            {s.sku}
                            {s.countNote ? ` · ${s.countNote}` : ""}
                          </span>
                        </Link>
                      </span>
                      <span role="cell" className="mono shelf">
                        {s.shelf ?? "—"}
                      </span>
                      <span role="cell" className="n">
                        {s.onShelf}
                      </span>
                      <span role="cell" className="n">
                        {s.committed}
                      </span>
                      <span
                        role="cell"
                        className={`big${
                          status === "out"
                            ? " problem"
                            : status === "healthy"
                              ? ""
                              : " tape-ink"
                        }`}
                      >
                        <span>{avail}</span>
                        <span className="meter" aria-hidden="true">
                          <i
                            style={{
                              width: `${pct}%`,
                              background: meterColor,
                            }}
                          />
                        </span>
                      </span>
                      <span role="cell" className="n">
                        {s.reorderPoint}
                      </span>
                      <span
                        role="cell"
                        className={`incoming${s.incomingQty ? "" : " none"}`}
                      >
                        {s.incomingQty
                          ? `${s.incomingQty} · ${s.incomingDay ?? ""}`
                          : "None"}
                      </span>
                      <span role="cell">
                        {status === "out" ? (
                          <Stamp tone="problem">Out</Stamp>
                        ) : status === "count" ? (
                          <Stamp tone="tape">Count</Stamp>
                        ) : status === "low" ? (
                          <Stamp tone="tape">Low</Stamp>
                        ) : (
                          <Stamp tone="paid">Healthy</Stamp>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="pf">
              <span>
                Available = on shelf − committed to paid orders. Showing{" "}
                {visible.length} of {rows.length}.
              </span>
              {rows.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setQuery({ n: String(shown + 10) })}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "var(--ink)",
                  }}
                >
                  Show 10 more
                </button>
              )}
            </div>
          </section>

          <div className="ops-stack">
            <section className="panel" aria-labelledby="ops-inc">
              <div className="ph">
                <h2 id="ops-inc">Arriving this week</h2>
                <span className="ph-note">{num(arriving)} units</span>
              </div>
              {pos.map((po) => {
                const isReceived = received.has(po.id);
                return (
                  <div className="ops-po" key={po.id}>
                    <div className="ops-po-head">
                      <b>{po.supplier}</b>
                      <span className="mono">{po.id}</span>
                    </div>
                    <span className="ops-po-when">
                      {po.etaLabel} · {po.units} units
                    </span>
                    <span className="mono ops-po-lines">{po.linesLabel}</span>
                    {isReceived ? (
                      <span style={{ marginTop: 4 }}>
                        <Stamp tone="paid">Received</Stamp>
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => shop.receiveDelivery(po.id)}
                      >
                        Receive delivery
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="panel" aria-labelledby="ops-mvh">
              <div className="ph">
                <h2 id="ops-mvh">Stock movements today</h2>
                <Link className="ph-link" href="/admin/settings/audit">
                  Full ledger
                </Link>
              </div>
              <div>
                {movements.map((m, i) => (
                  <div className="mv" key={`${m.time}-${i}`}>
                    <time>{m.time}</time>
                    <span>
                      {m.label}
                      {m.skuLabel ? (
                        <>
                          {" · "}
                          <span className="mono">{m.skuLabel}</span>
                        </>
                      ) : null}
                    </span>
                    <b
                      className={`mv-delta${
                        m.tone === "tape"
                          ? " tape-ink"
                          : m.tone === "paid"
                            ? " paid"
                            : ""
                      }`}
                    >
                      {m.deltaLabel}
                    </b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryInner />
    </Suspense>
  );
}
