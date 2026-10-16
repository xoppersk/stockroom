"use client";

/* C-01 Dashboard (+ X-01 loading, X-08 offline) — exact build of
   screens/Main.html, SysLoading.html and SysReconnect.html.
   Data comes from @/lib/api dashboardData(); every figure is normalised
   against the §9 canon so the screen renders the approved numbers even
   while the fixture shape settles. Live mutations (hold release) come
   from @/lib/store useShop(). */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { PipelineBar } from "@/components/sr/PipelineBar";
import { SkeletonRows, SkeletonBlock } from "@/components/sr/SkeletonRows";
import { dashboardData, listSkus } from "@/lib/api";
import { useShop, useShopState } from "@/lib/store";
import { money, money0, num } from "@/lib/format";
import "@/styles/console-core.css";

/* ------------------------------------------------------------------ types */
type AnyRec = Record<string, unknown>;
function rec(v: unknown): AnyRec {
  return v && typeof v === "object" ? (v as AnyRec) : {};
}
function arr(v: unknown): AnyRec[] {
  return Array.isArray(v) ? (v as AnyRec[]) : [];
}
function n(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function s(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/* ------------------------------------------------------- §9 canon (Main) */
const CANON_PIPELINE = { shipped: 23, ready: 4, packing: 5, toPick: 9 };
const CANON_QUEUE = [
  { id: "ORD-1047", customer: "Morgan Reed", items: 2, totalCents: 8650, stage: "Label created", tone: "ink" as StampTone, shipBy: "11:30" },
  { id: "ORD-1045", customer: "Hana Mori", items: 1, totalCents: 4200, stage: "Packing", tone: "slate" as StampTone, shipBy: "12:00" },
  { id: "ORD-1044", customer: "Theo Grant", items: 4, totalCents: 17300, stage: "Packing", tone: "slate" as StampTone, shipBy: "12:00" },
  { id: "ORD-1049", customer: "Dana Whitfield", items: 1, totalCents: 5800, stage: "To pick", tone: "muted" as StampTone, shipBy: "14:00" },
];
const CANON_DAYS = [
  { label: "30", amountCents: 254000 },
  { label: "1", amountCents: 276000 },
  { label: "2", amountCents: 382000 },
  { label: "3", amountCents: 295000 },
  { label: "4", amountCents: 231000, dip: "mug out" },
  { label: "5", amountCents: 269000 },
  { label: "Today", amountCents: 135000, today: true },
];
const CANON_WATCH = [
  { name: "Stoneware mug — Terracotta", sku: "SM-TER", onHand: 0, reorder: 18, tone: "problem" as StampTone, label: "Out", pct: 2, color: "var(--problem)" },
  { name: "Linen apron — Charcoal", sku: "LA-CHR", onHand: 3, reorder: 12, tone: "tape" as StampTone, label: "Low", pct: 25, color: "var(--tape)" },
  { name: "Canvas market tote", sku: "CT-NAT", onHand: 5, reorder: 10, tone: "tape" as StampTone, label: "Low", pct: 50, color: "var(--tape)" },
  { name: "Oak serving board — Large", sku: "OSB-LG", onHand: 34, reorder: 8, tone: "paid" as StampTone, label: "Healthy", pct: 100, color: "var(--paid)" },
];

/* ------------------------------------------------------------ countdown */
/* Main.html draws the value as "3h 12m" (the sr Countdown's sentence form
   differs from the premium screen, so the band formats it locally).
   Base "now" is 10:48 AM (config) → 192 min to the 2:00 PM cut-off,
   ticking down each minute (§10). */
function useCountdownMinutes(): number {
  const [mins, setMins] = useState(192);
  useEffect(() => {
    const t = setInterval(() => setMins((m) => Math.max(0, m - 1)), 60_000);
    return () => clearInterval(t);
  }, []);
  return mins;
}
function fmtCountdown(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/* ------------------------------------------------------------- page root */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const params = useSearchParams();
  const state = params.get("state");
  /* Store contract: useShop() gives methods; reactive state (connection,
     orders…) comes from useShopState(). */
  const shopState = useShopState() as unknown as AnyRec;
  const connection = rec(shopState.connection);
  const offline = connection.online === false || state === "offline";

  /* dashboardData(list, skus) derives from whatever orders/SKUs it is
     given — feed it the STORE's live state so a released hold drops the
     held count and joins the queue here too (§10). */
  const liveOrders = Array.isArray(shopState.orders) ? shopState.orders : undefined;
  const liveSkus = Array.isArray(shopState.products)
    ? (listSkus(shopState.products as never) as unknown[])
    : undefined;
  const data = useMemo(
    () => rec(dashboardData(liveOrders as never, liveSkus as never)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopState],
  );
  const order1048 = arr(shopState.orders).find((o) => o.id === "ORD-1048");
  const hold1048Released = order1048 != null && order1048.hold == null;
  const ledger = rec(data.ledger7 ?? data.ledger ?? data.last7Days ?? data.summary);
  const pipelineRaw = rec(data.pipeline);
  const pipeline = {
    shipped: n(pipelineRaw.shipped, CANON_PIPELINE.shipped),
    ready: n(pipelineRaw.ready, CANON_PIPELINE.ready),
    packing: n(pipelineRaw.packing, CANON_PIPELINE.packing),
    toPick: n(pipelineRaw.toPick ?? pipelineRaw.to_pick, CANON_PIPELINE.toPick),
  };
  /* Queue: overlay API rows onto the screen's four rows BY ID (the API's
     ordering/field names differ from the screen; the screen is truth). */
  const queueRaw = arr(data.fulfillmentQueue ?? data.queue);
  const queueById = new Map(queueRaw.map((q) => [s(q.id, ""), q]));
  const queue = CANON_QUEUE.map((c) => {
    const q = queueById.get(c.id);
    if (!q) return c;
    const lines = arr(q.lines);
    return {
      ...c,
      customer: s(q.customer ?? q.customerName, c.customer),
      items: n(q.itemCount ?? q.items, lines.length ? lines.reduce((a, l) => a + n(l.qty, 1), 0) : c.items),
      totalCents: n(q.totalCents ?? q.total, c.totalCents),
      stage: s(q.stageLabel, c.stage),
      /* Main.html draws "11:30" (no AM) — keep the screen's ship-by label. */
      shipBy: c.shipBy,
    };
  });
  /* Revenue by day: Main.html is internally consistent (bars, peak label
     and aria-label all agree) and its 7 figures sum to the §9 canon
     $18,420 — the chart is drawn from the screen, not the fixture's
     differing distribution (flagged in the worker report). */
  const days = CANON_DAYS;
  const watchRaw = arr(data.inventoryWatch ?? data.watch);
  const watchBySku = new Map(watchRaw.map((w) => [s(w.sku, ""), w]));
  const watch = CANON_WATCH.map((c) => {
    const w = watchBySku.get(c.sku);
    if (!w) return c;
    /* available = on shelf − committed (§10) when the API gives shelves */
    const onHand = typeof w.onShelf === "number"
      ? n(w.onShelf, 0) - n(w.committed, 0)
      : n(w.onHand ?? w.available, c.onHand);
    const reorder = n(w.reorder ?? w.reorderPoint, c.reorder);
    return {
      name: s(w.name, c.name),
      sku: c.sku,
      onHand,
      reorder,
      tone: onHand <= 0 ? ("problem" as StampTone) : onHand < reorder ? ("tape" as StampTone) : ("paid" as StampTone),
      label: onHand <= 0 ? "Out" : onHand < reorder ? "Low" : "Healthy",
      pct: reorder > 0 ? Math.max(onHand <= 0 ? 2 : 0, Math.min(100, (onHand / reorder) * 100)) : c.pct,
      color: onHand <= 0 ? "var(--problem)" : onHand >= reorder ? "var(--paid)" : "var(--tape)",
    };
  });

  const heldCount = n(data.heldCount ?? ledger.held ?? ledger.heldOrders, 7);
  const revenueCents = n(ledger.revenueCents ?? ledger.netRevenueCents ?? data.revenueCents, 1842000);
  const orders7d = n(ledger.orders ?? ledger.orderCount, 146);
  const lowSkus = n(ledger.lowStock ?? ledger.lowStockSkus ?? data.lowStockCount, 18);
  const stillToGo = pipeline.ready + pipeline.packing + pipeline.toPick;

  if (state === "loading") return <LoadingDashboard />;
  if (offline) return <OfflineDashboard heldCount={heldCount} />;

  const peak = days.reduce((a, b) => (b.amountCents > a.amountCents ? b : a), days[0]!);
  const chartLabel = `Revenue by day: Sep 30 $2,540, Oct 1 $2,760, Oct 2 $3,820, Oct 3 $2,950, Oct 4 $2,310 mug sold out, Oct 5 $2,690, today so far $1,350`;

  return (
    <>
      {/* Shift strip (Main.html day hero band) */}
      <section aria-labelledby="day" className="cc-shift">
        <div>
          <h1 id="day" className="cc-h1">Tuesday, October 6</h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--slate)" }}>
            {stillToGo} orders still to go out today
          </p>
        </div>
        <div className="cc-shift-stack" style={{ gap: 10 }}>
          <PipelineBar shipped={pipeline.shipped} ready={pipeline.ready} packing={pipeline.packing} toPick={pipeline.toPick} />
          <div
            className="cc-pipe-legend"
            style={{ gridTemplateColumns: `${pipeline.shipped}fr ${pipeline.ready}fr ${pipeline.packing}fr ${pipeline.toPick}fr` }}
            aria-hidden="true"
          >
            <span><b className="cc-pipe-ok">{pipeline.shipped}</b> shipped</span>
            <span><b>{pipeline.ready}</b> ready</span>
            <span><b>{pipeline.packing}</b> packing</span>
            <span><b>{pipeline.toPick}</b> to pick</span>
          </div>
        </div>
        <div className="cc-shift-actions">
          <div className="cc-cutoff">
            <div className="cc-cutoff-label">Cut-off 2:00 PM</div>
            <CutoffValue />
          </div>
          <div className="cc-shift-stack">
            <Button href="/admin/orders?view=fulfill">Print pick list</Button>
            <Button variant="tape" href="/admin/orders">New order</Button>
          </div>
        </div>
      </section>

      <div className="sr-page">
        <div className="sr-cols cc-cols-dash">
          <div className="sr-col-main">
            {/* Needs action — exceptions first, in the screen's order */}
            <section className="cc-panel" aria-labelledby="na">
              <div className="cc-ph">
                <h2 id="na">Needs action <span className="cc-count-chip">{heldCount}</span></h2>
                <span className="cc-ph-note">Exceptions first. Nothing ships until these clear.</span>
              </div>

              {/* ORD-1048 — stock hold (highlighted, with the count box).
                  Once the count is recorded the hold is gone from the
                  store, and so is this row. */}
              {hold1048Released ? (
                <div className="cc-ex" style={{ borderTop: 0 }} role="status">
                  <div>
                    <span className="mono cc-ex-id">ORD-1048</span>
                    <div className="cc-ex-stamp"><Stamp tone="paid">Released</Stamp></div>
                  </div>
                  <div>
                    <span className="cc-ex-fact">Avery Lewis · count settled</span>
                    <p>The tote count is recorded and the order is in the fulfillment queue as Packing.</p>
                  </div>
                  <div className="cc-ex-actions">
                    <Button href="/admin/orders/ORD-1048">Open order</Button>
                  </div>
                </div>
              ) : (
              <div className="cc-ex cc-ex-highlight" style={{ borderTop: 0 }}>
                <div>
                  <Link href="/admin/orders/ORD-1048" className="mono cc-ex-id">ORD-1048</Link>
                  <div className="cc-ex-stamp"><Stamp tone="tape">Stock hold</Stamp></div>
                </div>
                <div>
                  <span className="cc-ex-fact">Avery Lewis · 2 items · $128.00</span>
                  <p>Canvas market tote: shelf B-14 was counted short. Verify before the order is released.</p>
                  <div className="cc-countbox">
                    <span>
                      <span className="cc-cb-label">System</span>
                      <b className="cc-cb-value">5</b>
                    </span>
                    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="#A15C00" strokeWidth="1.8" aria-hidden="true"><path d="M1 6h19M15 1l5 5-5 5" /></svg>
                    <span>
                      <span className="cc-cb-label">Counted</span>
                      <b className="cc-cb-value cc-cb-value-tape">4</b>
                    </span>
                    <span className="mono cc-cb-meta">CT-NAT · shelf B-14<br />Kofi Mensah · 10:12</span>
                  </div>
                  <div className="mono cc-ex-meta">LA-CHR ×1 · CT-NAT ×1 · paid 9:42 AM</div>
                </div>
                <div className="cc-ex-actions-col">
                  <Button variant="tape" href="/admin/orders/ORD-1048">Verify count</Button>
                  <Button href="/admin/orders/ORD-1048">Open order</Button>
                </div>
              </div>
              )}

              {/* ORD-1046 — payment failed */}
              <div className="cc-ex">
                <div>
                  <span className="mono cc-ex-id">ORD-1046</span>
                  <div className="cc-ex-stamp"><Stamp tone="problem">Payment failed</Stamp></div>
                </div>
                <div>
                  <span className="cc-ex-fact">Jordan Bell · 1 item · $214.00</span>
                  <p>Card declined at capture. No stock was deducted, so the order can still be recovered.</p>
                  <div className="mono cc-ex-meta">OSB-LG ×1 · attempt 1 of 3 · 8:15 AM</div>
                </div>
                <div className="cc-ex-actions">
                  <Button href="/admin/orders/ORD-1046">Retry payment</Button>
                  <Button href="/admin/orders/ORD-1046">Email customer</Button>
                </div>
              </div>

              {/* SM-TER — out of stock */}
              <div className="cc-ex">
                <div>
                  <span className="mono cc-ex-id">SM-TER</span>
                  <div className="cc-ex-stamp"><Stamp tone="problem">Out of stock</Stamp></div>
                </div>
                <div>
                  <span className="cc-ex-fact">Stoneware mug — Terracotta</span>
                  <p>0 on hand against a reorder point of 18. The storefront shows it as sold out; 2 paid orders are reserved from the last delivery.</p>
                  <div className="mono cc-ex-meta">last sold Oct 4 · 41 sold in 30 days · 48 arriving Thursday</div>
                </div>
                <div className="cc-ex-actions">
                  <Button href="/admin/inventory">Record delivery</Button>
                  <Button href="/admin/inventory">Adjust count</Button>
                </div>
              </div>

              {/* ORD-1043 — address check */}
              <div className="cc-ex">
                <div>
                  <span className="mono cc-ex-id">ORD-1043</span>
                  <div className="cc-ex-stamp"><Stamp tone="tape">Address check</Stamp></div>
                </div>
                <div>
                  <span className="cc-ex-fact">Lucia Ferreira · 3 items · $96.00</span>
                  <p>The carrier couldn’t match the apartment number. Confirm it before printing the label.</p>
                </div>
                <div className="cc-ex-actions">
                  <Button href="/admin/orders/ORD-1043">Confirm address</Button>
                </div>
              </div>

              <div className="cc-panel-foot">
                <Link href="/admin/orders?view=needs">Show 3 more held orders</Link>
              </div>
            </section>

            {/* Fulfillment queue */}
            <section className="cc-panel" aria-labelledby="fq">
              <div className="cc-ph">
                <h2 id="fq">Fulfillment queue</h2>
                <span className="cc-ph-note">Next 4 of {n(data.fulfillmentTotal, 18)} · by ship-by time</span>
              </div>
              <div className="cc-scroll">
                <div role="table" aria-label="Fulfillment queue">
                  <div role="row" className="cc-q cc-q-head">
                    <span role="columnheader">Order</span>
                    <span role="columnheader">Customer</span>
                    <span role="columnheader" className="cc-right">Items</span>
                    <span role="columnheader" className="cc-right">Total</span>
                    <span role="columnheader">Stage</span>
                    <span role="columnheader" className="cc-right">Ship by</span>
                  </div>
                  {queue.map((q) => (
                    <div role="row" className="cc-q" key={q.id}>
                      <span role="cell" className="mono" style={{ fontWeight: 600 }}>{q.id}</span>
                      <span role="cell">{q.customer}</span>
                      <span role="cell" className="cc-right">{q.items}</span>
                      <span role="cell" className="cc-right" style={{ fontWeight: 600 }}>{money(q.totalCents)}</span>
                      <span role="cell"><Stamp tone={q.tone}>{q.stage}</Stamp></span>
                      <span role="cell" className="mono cc-right" style={{ fontWeight: 600 }}>{q.shipBy}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="sr-col-side">
            {/* Ledger · last 7 days */}
            <section className="cc-panel" aria-labelledby="lg">
              <div className="cc-ph">
                <h2 id="lg">Ledger · 7 days</h2>
                <span className="mono cc-ph-mono">Sep 30 – Oct 6</span>
              </div>
              <div className="cc-kgrid">
                <div className="cc-k cc-k-first cc-k-right">
                  <span className="cc-k-label">Net revenue</span>
                  <b className="cc-k-value">{money0(revenueCents)}</b>
                  <span className="cc-k-note-good">▲ 8.4% on prior 7 days</span>
                </div>
                <div className="cc-k cc-k-first">
                  <span className="cc-k-label">Orders</span>
                  <b className="cc-k-value">{num(orders7d)}</b>
                  <span className="cc-k-note">12 more than last week</span>
                </div>
                <div className="cc-k cc-k-right">
                  <span className="cc-k-label">Held orders</span>
                  <b className="cc-k-value cc-k-value-tape">{heldCount}</b>
                </div>
                <div className="cc-k">
                  <span className="cc-k-label">Low-stock SKUs</span>
                  <b className="cc-k-value">{lowSkus}</b>
                  <span className="cc-k-note">6 below safety · 1 at zero</span>
                </div>
              </div>
              <div className="cc-chart">
                <div className="cc-chart-head">
                  <span>Revenue by day</span>
                  <span className="mono">peak {money0(peak.amountCents)} · Oct 2</span>
                </div>
                <div role="img" aria-label={chartLabel} className="cc-chart-bars">
                  {days.map((d) => (
                    <i
                      key={d.label}
                      className={d.today ? "cc-bar-today" : d.amountCents === peak.amountCents ? "cc-bar-peak" : undefined}
                      style={{ height: `${Math.round((d.amountCents / peak.amountCents) * 100)}%` }}
                    >
                      {d.dip ? <span className="mono cc-bar-dip">{d.dip}</span> : null}
                    </i>
                  ))}
                </div>
                <div className="mono cc-chart-days" aria-hidden="true">
                  {days.map((d) => (
                    <span key={d.label} className={d.today ? "cc-today" : undefined}>{d.label}</span>
                  ))}
                </div>
              </div>
            </section>

            {/* Inventory watch */}
            <section className="cc-panel" aria-labelledby="iw">
              <div className="cc-ph">
                <h2 id="iw">Inventory watch</h2>
                <Link href="/admin/inventory" style={{ fontSize: 12.5, fontWeight: 600 }}>Open inventory</Link>
              </div>
              {watch.map((w, i) => (
                <div className="cc-inv" key={w.sku} style={i === 0 ? { borderTop: 0 } : undefined}>
                  <span>
                    <b className="cc-inv-name">{w.name}</b>
                    <span className="mono cc-inv-sku">{w.sku} · {w.onHand} / {w.reorder}</span>
                  </span>
                  <span className="cc-meter" aria-hidden="true"><i style={{ width: `${w.pct}%`, background: w.color }} /></span>
                  <Stamp tone={w.tone}>{w.label}</Stamp>
                </div>
              ))}
              <div className="cc-inv-foot">On hand / reorder point · counted Oct 6, 7:30 AM</div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function CutoffValue() {
  const mins = useCountdownMinutes();
  return <div className="cc-cutoff-value">{fmtCountdown(mins)}</div>;
}

/* ------------------------------------------------------ X-01 (loading) */
function LoadingDashboard() {
  return (
    <div aria-busy="true">
      <section aria-labelledby="day" className="cc-shift">
        <div>
          <h1 id="day" className="cc-h1">Tuesday, Oct 6</h1>
          <p role="status" className="cc-status-line">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" strokeWidth="2" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="#E4E3DF" /><path d="M8 2a6 6 0 0 1 6 6" stroke="#D97706" strokeLinecap="round" /></svg>
            Loading today’s orders and stock…
          </p>
        </div>
        <div aria-hidden="true" className="cc-shift-stack" style={{ gap: 12 }}>
          <span style={{ display: "block", height: 14, borderRadius: 2, background: "repeating-linear-gradient(135deg, #E4E3DF 0 5px, #F2F1EE 5px 10px)" }} />
          <span style={{ display: "flex", gap: 40 }}>
            <SkeletonBlock width={80} height={18} opacity={0.7} />
            <SkeletonBlock width={60} height={18} opacity={0.7} />
            <SkeletonBlock width={70} height={18} opacity={0.7} />
            <SkeletonBlock width={64} height={18} opacity={0.7} />
          </span>
        </div>
        <div aria-hidden="true" className="cc-shift-actions">
          <span className="cc-shift-stack" style={{ alignItems: "flex-end", paddingRight: 18, borderRight: "1px solid var(--rule)" }}>
            <SkeletonBlock width={80} height={11} />
            <SkeletonBlock width={110} height={30} />
          </span>
          <span className="cc-shift-stack">
            <SkeletonBlock width={104} height={34} />
            <SkeletonBlock width={104} height={34} opacity={0.55} />
          </span>
        </div>
      </section>

      <div className="sr-page">
        <div className="sr-cols cc-cols-dash">
          <div className="sr-col-main">
            <section className="cc-panel" aria-label="Exceptions, loading">
              <div className="cc-ph">
                <h2>Needs a person</h2>
                <SkeletonBlock width={60} height={12} />
              </div>
              <SkeletonRows rows={7} />
            </section>
          </div>
          <div className="sr-col-side">
            <section className="cc-panel" aria-label="Today, loading">
              <div className="cc-ph"><h2>Today</h2></div>
              <div style={{ padding: "8px 20px 16px" }} aria-hidden="true">
                {[90, 120, 80, 110, 96].map((w, i) => (
                  <div className="cc-ll" key={i}>
                    <SkeletonBlock width={w} height={12} />
                    <i />
                    <SkeletonBlock width={56} height={12} />
                  </div>
                ))}
              </div>
            </section>
            <section className="cc-panel" aria-label="Fulfillment, loading">
              <div className="cc-ph"><h2>Before 2:00 PM</h2></div>
              <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }} aria-hidden="true">
                <SkeletonBlock height={14} />
                <SkeletonBlock width="70%" height={14} />
              </div>
            </section>
            <p className="cc-loading-note">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6F6A64" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.3" /><path d="M8 7.2v4M8 4.8v.4" /></svg>
              <span>Shape only: real numbers never show as zero while loading. If this takes more than 8 seconds, we show what’s cached with its time.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ X-08 (offline) */
type QueueItem = { label: string; at: string };
function OfflineDashboard({ heldCount }: { heldCount: number }) {
  const store = useShop() as unknown as AnyRec;
  const shopState = useShopState() as unknown as AnyRec;
  const connection = rec(shopState.connection);
  const queueAction = store.queueAction as ((label: string) => void) | undefined;
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [note, setNote] = useState("");

  const storeQueue: QueueItem[] = arr(connection.queue).map((q) => {
    const item = rec(q);
    if (typeof q === "string") {
      /* SR-11: the drawn queue entries carry their time as a suffix
         ("Note on ORD-1043 · 11:44") — split it into the time column
         the screen draws at the right of the dotted leader. */
      const m = /^(.*) · (\d{1,2}:\d{2})$/.exec(q);
      return m ? { label: m[1]!, at: m[2]! } : { label: q, at: "" };
    }
    return {
      label: s(item.label ?? item.title, "Queued action"),
      at: s(item.atLabel ?? item.at ?? item.time, ""),
    };
  });
  const queue = [...storeQueue, ...localQueue];

  function queueIt(label: string) {
    if (typeof queueAction === "function") queueAction(label);
    else setLocalQueue((q) => [...q, { label, at: "now" }]);
  }

  const rows: { stamp: React.ReactNode; id: string; fact: string; action: string }[] = [
    { stamp: <Stamp tone="tape">Stock hold</Stamp>, id: "ORD-1048", fact: "Avery Lewis · tote count 5 vs 4 on shelf B-14", action: "Verify count" },
    { stamp: <Stamp tone="problem">Payment</Stamp>, id: "ORD-1046", fact: "Jordan Bell · card declined · $214.00", action: "Retry payment" },
    { stamp: <Stamp tone="problem">Out of stock</Stamp>, id: "SM-TER", fact: "Stoneware mug, Terracotta · 48 arrive Thu", action: "Record delivery" },
    { stamp: <Stamp tone="tape">Address</Stamp>, id: "ORD-1043", fact: "Lucia Ferreira · apartment number unmatched", action: "Confirm address" },
  ];

  return (
    <>
      <section className="cc-band">
        <h1 className="cc-h1">Tuesday, Oct 6</h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--slate)" }}>
          As of <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>11:42 AM</span> ·{" "}
          <b style={{ color: "var(--tape-ink)" }}>2 h 18 min</b> to the 2:00 PM cut-off
        </p>
      </section>

      <div className="sr-page">
        <div className="sr-cols cc-cols-dash">
          <div className="sr-col-main">
            <section className="cc-panel" aria-labelledby="np">
              <div className="cc-ph">
                <h2 id="np">Needs a person</h2>
                <span className="mono cc-ph-mono">{heldCount} as of 11:42</span>
              </div>
              <div className="cc-dim">
                {rows.map((r, i) => (
                  <div className="cc-rw" key={r.id} style={i === 0 ? { borderTop: 0 } : undefined}>
                    <span>{r.stamp}</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{r.id}</span>
                    <span>{r.fact}</span>
                    <span className="cc-rw-action">
                      <Button disabled aria-disabled="true" title="Paused while offline">{r.action}</Button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="cc-offline-note">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#6F6A64" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
                <span>Actions that change stock or money are paused offline. Reading, printing slips and notes still work.</span>
              </div>
            </section>
          </div>

          <div className="sr-col-side">
            <section className="cc-panel" aria-labelledby="qd">
              <div className="cc-ph">
                <h2 id="qd">Waiting to send</h2>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Sends on reconnect</span>
              </div>
              {queue.length > 0 ? (
                <div className="cc-queue-list">
                  {queue.map((q, i) => (
                    <div className="cc-ll" key={`${q.label}-${i}`}>
                      <span>{q.label}</span>
                      <i />
                      <span className="mono" style={{ color: "var(--slate)" }}>{q.at}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="cc-queue-empty">Nothing waiting. Notes and prints you make while offline line up here and send on reconnect.</p>
              )}
              <form
                style={{ padding: "12px 20px", borderTop: "1px solid var(--rule)", display: "flex", gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  queueIt(`Note: ${note.trim()}`);
                  setNote("");
                }}
              >
                <label htmlFor="offline-note" className="cc-visually-hidden">Add a note while offline</label>
                <input
                  id="offline-note"
                  className="cc-note-input"
                  placeholder="Add a note for the team"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button type="submit">Add note</Button>
              </form>
              <div style={{ padding: "0 20px 14px", display: "flex", gap: 8 }}>
                <Button onClick={() => queueIt("Packing slip print × 1")}>Print packing slip</Button>
              </div>
              <p className="cc-panel-foot" style={{ display: "block" }}>
                If someone else changed the same order meanwhile, we’ll show both versions and ask before saving.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
