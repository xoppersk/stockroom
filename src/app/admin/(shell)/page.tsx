/* C-01 Dashboard (+ X-01 loading) — exact build of screens/Main.html
   and SysLoading.html.
   W-ORDERS rewire: this is now an async SERVER component. All figures
   come from getDashboard() (console data layer, staff-RLS session
   reads over real orders + SKUs); derivations come from @/lib/derive
   only. The CANON_* hard-coded fallback blocks are REMOVED — real data
   or honest empty states in the same layout. The countdown uses real
   now vs the 2:00 PM cut-off (config). The X-08 offline dashboard
   variant is REMOVED: offline is the shell's real browser-event banner
   now (ConsoleShell) — the fixture offline queue was demo theatre. */

import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { PipelineBar } from "@/components/sr/PipelineBar";
import { SkeletonRows, SkeletonBlock } from "@/components/sr/SkeletonRows";
import { getDashboard } from "@/lib/shop/admin";
import { availableOf } from "@/lib/derive";
import { SHOP_TIMEZONE } from "@/lib/config";
import { money, money0, num } from "@/lib/format";
import type { DashboardException, Order, OrderLine, RevenueDay, Sku } from "@/lib/types";
import { DashboardCountdown } from "./DashboardCountdown";
import "@/styles/console-core.css";

/* Server-side minutes to the 2:00 PM cut-off from REAL now (shop tz) —
   the countdown island's initial value; the island re-syncs on mount. */
function serverMinutesToCutoff(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "minute") minute = Number(part.value);
  }
  return Math.max(0, 14 * 60 - (hour * 60 + minute));
}

function stageTone(stage: Order["stage"]): StampTone {
  switch (stage) {
    case "ready":
      return "ink";
    case "packing":
      return "slate";
    case "to-pick":
      return "muted";
    case "shipped":
    case "delivered":
      return "paid";
    case "held":
      return "tape";
    default:
      return "slate";
  }
}

/** Queue ship-by in Main.html's short form ("11:30", no meridiem). */
function shortShipBy(label: string): string {
  return label.replace(/\s?(AM|PM)$/i, "");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const params = await searchParams;
  if (params.state === "loading") return <LoadingDashboard />;

  const data = await getDashboard();
  const pipeline = data.pipeline;
  const stillToGo = data.toGoToday;
  const heldCount = data.ledger7.heldOrders;
  const exceptions = data.exceptions;
  const queue = data.fulfillmentQueue.slice(0, 4);
  const ledger = data.ledger7;
  const days = ledger.revenueByDay;
  const peak = days.reduce(
    (a: RevenueDay, b: RevenueDay) => (b.revenueCents > a.revenueCents ? b : a),
    days[0] ?? { dateISO: "", dateLabel: "", dayLabel: "", orders: 0, revenueCents: 0 },
  );
  const peakDayLabel = peak.dayLabel || peak.dateLabel;
  const chartLabel =
    days.length > 0
      ? `Revenue by day: ${days
          .map((d: RevenueDay) => `${d.dayLabel || d.dateLabel} ${money0(d.revenueCents)}${d.note ? ` ${d.note}` : ""}`)
          .join(", ")}`
      : "Revenue by day: no orders in the last 7 days";
  const moreHeld = data.moreHeldCount;
  const initialCountdown = serverMinutesToCutoff();

  return (
    <>
      {/* Shift strip (Main.html day hero band) */}
      <section aria-labelledby="day" className="cc-shift">
        <div>
          <h1 id="day" className="cc-h1">{data.dayHeroLabel}</h1>
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
            <div className="cc-cutoff-label">Cut-off {data.cutoffLabel}</div>
            <DashboardCountdown initialMinutes={initialCountdown} />
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
            {/* Needs action — real exceptions first (held orders, then
                sold-out SKUs), in the data layer's problem-first order. */}
            <section className="cc-panel" aria-labelledby="na">
              <div className="cc-ph">
                <h2 id="na">Needs action <span className="cc-count-chip">{heldCount}</span></h2>
                <span className="cc-ph-note">Exceptions first. Nothing ships until these clear.</span>
              </div>

              {exceptions.length === 0 ? (
                <div className="cc-ex" style={{ borderTop: 0 }} role="status">
                  <div>
                    <div className="cc-ex-stamp"><Stamp tone="paid">Clear</Stamp></div>
                  </div>
                  <div>
                    <span className="cc-ex-fact">Nothing is held right now.</span>
                    <p>Held orders and stock exceptions show here as soon as they happen.</p>
                  </div>
                  <div className="cc-ex-actions">
                    <Button href="/admin/orders">Open orders</Button>
                  </div>
                </div>
              ) : (
                exceptions.slice(0, 4).map((ex: DashboardException, i: number) => (
                  <ExceptionRow key={ex.id} ex={ex} first={i === 0} />
                ))
              )}

              {moreHeld > 0 ? (
                <div className="cc-panel-foot">
                  <Link href="/admin/orders?view=needs">Show {moreHeld} more held orders</Link>
                </div>
              ) : null}
            </section>

            {/* Fulfillment queue */}
            <section className="cc-panel" aria-labelledby="fq">
              <div className="cc-ph">
                <h2 id="fq">Fulfillment queue</h2>
                <span className="cc-ph-note">Next {queue.length} of {data.fulfillmentTotal} · by ship-by time</span>
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
                  {queue.map((o: Order) => {
                    const items = o.lines.reduce((a: number, l: OrderLine) => a + l.qty, 0);
                    return (
                      <div role="row" className="cc-q" key={o.id}>
                        <span role="cell" className="mono" style={{ fontWeight: 600 }}>{o.id}</span>
                        <span role="cell">{o.customerName}</span>
                        <span role="cell" className="cc-right">{items}</span>
                        <span role="cell" className="cc-right" style={{ fontWeight: 600 }}>{money(o.totalCents)}</span>
                        <span role="cell"><Stamp tone={stageTone(o.stage)}>{o.stageLabel}</Stamp></span>
                        <span role="cell" className="mono cc-right" style={{ fontWeight: 600 }}>{shortShipBy(o.shipByLabel)}</span>
                      </div>
                    );
                  })}
                  {queue.length === 0 ? (
                    <div style={{ padding: "18px 20px", borderTop: "1px solid var(--rule)", color: "var(--muted)", fontSize: 13 }}>
                      Nothing waiting to fulfill. New paid orders join the queue here.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <div className="sr-col-side">
            {/* Ledger · last 7 days */}
            <section className="cc-panel" aria-labelledby="lg">
              <div className="cc-ph">
                <h2 id="lg">Ledger · 7 days</h2>
                <span className="mono cc-ph-mono">{ledger.rangeLabel}</span>
              </div>
              <div className="cc-kgrid">
                <div className="cc-k cc-k-first cc-k-right">
                  <span className="cc-k-label">Net revenue</span>
                  <b className="cc-k-value">{money0(ledger.revenueCents)}</b>
                  <span className={ledger.revenueChangePct >= 0 ? "cc-k-note-good" : "cc-k-note"}>
                    {ledger.revenueChangePct >= 0 ? "▲" : "▼"} {Math.abs(ledger.revenueChangePct).toFixed(1)}% on prior 7 days
                  </span>
                </div>
                <div className="cc-k cc-k-first">
                  <span className="cc-k-label">Orders</span>
                  <b className="cc-k-value">{num(ledger.orders)}</b>
                  <span className="cc-k-note">
                    {ledger.ordersVsLastWeek === 0
                      ? "Same as last week"
                      : ledger.ordersVsLastWeek > 0
                        ? `${ledger.ordersVsLastWeek} more than last week`
                        : `${Math.abs(ledger.ordersVsLastWeek)} fewer than last week`}
                  </span>
                </div>
                <div className="cc-k cc-k-right">
                  <span className="cc-k-label">Held orders</span>
                  <b className="cc-k-value cc-k-value-tape">{heldCount}</b>
                </div>
                <div className="cc-k">
                  <span className="cc-k-label">Low-stock SKUs</span>
                  <b className="cc-k-value">{ledger.lowStockSkus}</b>
                  <span className="cc-k-note">{ledger.belowSafety} below safety · {ledger.atZero} at zero</span>
                </div>
              </div>
              <div className="cc-chart">
                <div className="cc-chart-head">
                  <span>Revenue by day</span>
                  <span className="mono">peak {money0(peak.revenueCents)}{peakDayLabel ? ` · ${peakDayLabel}` : ""}</span>
                </div>
                <div role="img" aria-label={chartLabel} className="cc-chart-bars">
                  {days.map((d: RevenueDay) => (
                    <i
                      key={d.dateISO || d.dayLabel}
                      className={d.dayLabel === "Today" ? "cc-bar-today" : d.revenueCents === peak.revenueCents && peak.revenueCents > 0 ? "cc-bar-peak" : undefined}
                      style={{ height: `${peak.revenueCents > 0 ? Math.round((d.revenueCents / peak.revenueCents) * 100) : 0}%` }}
                    >
                      {d.note ? <span className="mono cc-bar-dip">{d.note}</span> : null}
                    </i>
                  ))}
                </div>
                <div className="mono cc-chart-days" aria-hidden="true">
                  {days.map((d: RevenueDay) => (
                    <span key={d.dateISO || d.dayLabel} className={d.dayLabel === "Today" ? "cc-today" : undefined}>{d.dayLabel || d.dateLabel}</span>
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
              {data.inventoryWatch.map((w: Sku, i: number) => {
                const onHand = availableOf(w);
                const reorder = w.reorderPoint;
                const tone: StampTone = onHand <= 0 ? "problem" : onHand < reorder ? "tape" : "paid";
                const label = onHand <= 0 ? "Out" : onHand < reorder ? "Low" : "Healthy";
                const pct = reorder > 0 ? Math.max(onHand <= 0 ? 2 : 0, Math.min(100, (onHand / reorder) * 100)) : 100;
                const color = onHand <= 0 ? "var(--problem)" : onHand >= reorder ? "var(--paid)" : "var(--tape)";
                const name = w.label && w.label !== w.productName ? `${w.productName} — ${w.label}` : w.productName;
                return (
                  <div className="cc-inv" key={w.sku} style={i === 0 ? { borderTop: 0 } : undefined}>
                    <span>
                      <b className="cc-inv-name">{name}</b>
                      <span className="mono cc-inv-sku">{w.sku} · {onHand} / {reorder}</span>
                    </span>
                    <span className="cc-meter" aria-hidden="true"><i style={{ width: `${pct}%`, background: color }} /></span>
                    <Stamp tone={tone}>{label}</Stamp>
                  </div>
                );
              })}
              {data.inventoryWatch.length === 0 ? (
                <p style={{ padding: "14px 20px", margin: 0, fontSize: 13, color: "var(--muted)" }}>
                  No SKUs to watch yet. Stock levels show here once products are live.
                </p>
              ) : null}
              <div className="cc-inv-foot">On hand / reorder point · live counts</div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/* One Needs-action row, generic over the viewed data (DashboardException
   from the data layer): order exceptions link to the order; stock
   exceptions link to inventory. The ORD-1048 count box is NOT drawn
   here any more — the recount lives on the order detail page (ruling
   5); this row carries the exception's real codes/actor labels. */
function ExceptionRow({ ex, first }: { ex: DashboardException; first: boolean }) {
  const href = ex.kind === "order" && ex.orderId ? `/admin/orders/${ex.orderId}` : "/admin/inventory";
  const actionLabel = ex.kind === "order" ? "Open order" : "Open inventory";
  return (
    <div className={`cc-ex${first && ex.kind === "order" ? " cc-ex-highlight" : ""}`} style={first ? { borderTop: 0 } : undefined}>
      <div>
        {ex.kind === "order" && ex.orderId ? (
          <Link href={href} className="mono cc-ex-id">{ex.orderId}</Link>
        ) : (
          <span className="mono cc-ex-id">{ex.sku ?? ex.orderId}</span>
        )}
        <div className="cc-ex-stamp"><Stamp tone={ex.tone}>{ex.stampLabel}</Stamp></div>
      </div>
      <div>
        <span className="cc-ex-fact">{ex.title}</span>
        <p>{ex.reason}</p>
        {ex.codesLabel ? <div className="mono cc-ex-meta">{ex.codesLabel}</div> : null}
        {ex.actorLabel ? <div className="mono cc-ex-meta">{ex.actorLabel}</div> : null}
      </div>
      <div className="cc-ex-actions">
        <Button href={href}>{actionLabel}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ X-01 (loading) */
function LoadingDashboard() {
  return (
    <div aria-busy="true">
      <section aria-labelledby="day" className="cc-shift">
        <div>
          <h1 id="day" className="cc-h1">Loading</h1>
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
