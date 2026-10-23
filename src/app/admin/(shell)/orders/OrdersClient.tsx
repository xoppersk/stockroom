"use client";

/* C-02 Orders island (W-ORDERS rewire). The server page fetches the real
   orders + summary (listConsoleOrders + derive.ordersSummary) and hands
   them here as props; this island keeps the drawn interaction exactly:
   views / stage / channel / carrier in the URL query (?view=, ?stage=,
   ?channel=, ?carrier=) as tab buttons and labelled selects (§10),
   checkbox selection with the derived selection bar, and row links to
   /admin/orders/{order_number}. No fixture store, no fixture API.
   Adaptations vs the fixture version (see worker log): the view tabs
   now actually filter (the fixture version ignored ?view=); selection
   starts empty (the fixture pre-selected three canon rows); bulk
   actions keep their notice behaviour and no longer route through the
   removed offline fixture queue; the carrier select is drawn but does
   not filter — orders carry no carrier column in the DB. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { money } from "@/lib/format";
import type { Order, OrdersSummary } from "@/lib/types";
import "@/styles/console-core.css";

type OrderRow = {
  id: string;
  placed: string;
  customer: string;
  skus: string;
  items: number;
  totalCents: number;
  paymentLabel: string;
  paymentTone: StampTone;
  stageLabel: string;
  stageTone: StampTone;
  stageKey: string; // to-pick | packing | ready | label-filter keys
  viewStage: string; // raw stage for view filtering
  channel: string;
  shipBy: string;
  held: boolean;
  paymentStatus: string;
  refundish: boolean;
  placedDay: string;
};

function paymentStamp(o: Order): { label: string; tone: StampTone } {
  switch (o.paymentStatus) {
    case "paid":
      return { label: "Paid", tone: "paid" };
    case "failed":
      return { label: "Failed", tone: "problem" };
    case "partially-refunded":
      return { label: "Part refunded", tone: "slate" };
    case "refunded":
      return { label: "Refunded", tone: "slate" };
    case "refund-requested":
      return { label: "Refund requested", tone: "tape" };
    default:
      return { label: o.paymentStatus, tone: "slate" };
  }
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

function toRow(o: Order): OrderRow {
  const pay = paymentStamp(o);
  const skus = o.lines
    .map((l) => (l.sku ? (l.qty > 1 ? `${l.sku} ×${l.qty}` : l.sku) : l.label))
    .join(", ");
  return {
    id: o.id,
    placed: o.placedLabel,
    customer: o.customerName,
    skus,
    items: o.lines.reduce((a, l) => a + l.qty, 0),
    totalCents: o.totalCents,
    paymentLabel: pay.label,
    paymentTone: pay.tone,
    stageLabel: o.stageLabel,
    stageTone: o.hold ? o.hold.tone : stageTone(o.stage),
    // The drawn Stage select filters pick / packing / label(=ready).
    stageKey: o.stage === "to-pick" ? "pick" : o.stage === "ready" ? "label" : o.stage,
    viewStage: o.stage,
    channel: o.channel,
    shipBy: o.shipByLabel,
    held: !!o.hold,
    paymentStatus: o.paymentStatus,
    refundish:
      o.paymentStatus === "partially-refunded" ||
      o.paymentStatus === "refund-requested" ||
      !!o.refundRequest,
    placedDay: o.placedDay,
  };
}

const OPEN_STAGES = ["held", "to-pick", "packing", "ready"];

const VIEWS: { key: string; label: string; countCls?: string }[] = [
  { key: "needs", label: "Needs action", countCls: "cc-cnt-tape" },
  { key: "fulfill", label: "To fulfill", countCls: "cc-cnt-ink" },
  { key: "shipped", label: "Shipped today", countCls: "cc-cnt-soft" },
  { key: "refunds", label: "Refunds", countCls: "cc-cnt-soft" },
  { key: "all", label: "All orders" },
];

export function OrdersClient({
  orders,
  summary,
}: {
  orders: Order[];
  summary: OrdersSummary;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view = params.get("view") ?? "fulfill";
  const stage = params.get("stage") ?? "any";
  const channel = params.get("channel") ?? "all";
  const carrier = params.get("carrier") ?? "any";
  const query = params.get("q") ?? "";

  const openCount = summary.openCount;
  const openCents = summary.openTotalCents;
  const held = summary.heldCount;
  const toFulfill = summary.toFulfillCount;
  const viewCounts: Record<string, number> = {
    needs: held,
    fulfill: toFulfill,
    shipped: summary.shippedTodayCount,
    refunds: summary.refundsCount,
  };

  const rows = useMemo<OrderRow[]>(() => orders.map(toRow), [orders]);

  const visible = rows.filter((r) => {
    if (view === "needs" && !(OPEN_STAGES.includes(r.viewStage) && r.held)) return false;
    if (view === "fulfill" && !(OPEN_STAGES.includes(r.viewStage) && !r.held)) return false;
    if (view === "shipped" && !(r.viewStage === "shipped" && r.placedDay === "today")) return false;
    if (view === "refunds" && !r.refundish) return false;
    if (stage !== "any" && r.stageKey !== stage) return false;
    if (channel !== "all" && r.channel !== channel) return false;
    // Carrier: drawn select kept; orders have no carrier in the DB, so
    // it does not filter (adaptation logged — no carrier column exists).
    void carrier;
    if (query && !`${r.id} ${r.customer} ${r.skus}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const selectedRows = visible.filter((r) => selected.has(r.id));
  const selectedItems = selectedRows.reduce((a, r) => a + r.items, 0);
  const allPaid = selectedRows.every((r) => r.paymentLabel === "Paid");

  function setParam(key: string, value: string, drop?: string) {
    const next = new URLSearchParams(params.toString());
    if (drop && value === drop) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulk(label: string) {
    setNotice(`${label}: ${selectedRows.length} orders, ${selectedItems} items.`);
  }

  const viewTotal =
    view === "needs"
      ? held
      : view === "fulfill"
        ? toFulfill
        : view === "shipped"
          ? summary.shippedTodayCount
          : view === "refunds"
            ? summary.refundsCount
            : rows.length;

  return (
    <>
      {/* Summary band + views (Orders.html) */}
      <section className="cc-band cc-band-tabs">
        <div className="cc-orders-band-grid">
          <div className="cc-band-stack">
            <h1 className="cc-h1">Orders</h1>
            <span className="cc-sub" style={{ maxWidth: 360 }}>
              {openCount} open orders worth {money(openCents)}. {held} are held; the other {toFulfill} ship by the 2:00 PM cut-off.
            </span>
          </div>
          <div className="cc-shift-stack" style={{ gap: 10 }}>
            <div
              role="img"
              aria-label={`${openCount} open orders: ${held} held, ${toFulfill} to fulfill`}
              style={{ display: "flex", height: 14, borderRadius: 2, overflow: "hidden", gap: 2 }}
            >
              <i style={{ flex: held, background: "var(--tape)", display: "block" }} />
              <i style={{ flex: toFulfill, background: "var(--ink)", display: "block" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `${held}fr ${toFulfill}fr`, gap: 2, fontSize: 12, color: "var(--slate)" }} aria-hidden="true">
              <span style={{ whiteSpace: "nowrap" }}><b className="cond" style={{ fontSize: 22, fontWeight: 800, color: "var(--tape-ink)" }}>{held}</b> held</span>
              <span style={{ whiteSpace: "nowrap" }}><b className="cond" style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>{toFulfill}</b> to fulfill</span>
            </div>
          </div>
          <div className="cc-btnrow">
            <Button>Export CSV</Button>
            <Button variant="tape">New order</Button>
          </div>
        </div>
        <div role="tablist" aria-label="Order views" className="cc-tabs">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className="cc-flt"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setParam("view", v.key, "fulfill")}
            >
              {v.label}
              {viewCounts[v.key] != null ? <span className={`cc-cnt ${v.countCls ?? ""}`}>{viewCounts[v.key]}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <div className="cc-listwrap">
        {/* Filters — stage / channel / carrier, all mirrored in the URL */}
        <div className="cc-filterbar">
          <label htmlFor="of" className="cc-visually-hidden">Filter orders</label>
          <input
            id="of"
            type="search"
            className="cc-search"
            placeholder="Filter by order, customer or SKU"
            value={query}
            onChange={(e) => setParam("q", e.target.value, "")}
          />
          <label htmlFor="st" className="cc-filter-label">Stage</label>
          <select id="st" className="cc-sel" value={stage} onChange={(e) => setParam("stage", e.target.value, "any")}>
            <option value="any">Any stage</option>
            <option value="pick">To pick</option>
            <option value="packing">Packing</option>
            <option value="label">Label created</option>
          </select>
          <label htmlFor="ch" className="cc-filter-label">Channel</label>
          <select id="ch" className="cc-sel" value={channel} onChange={(e) => setParam("channel", e.target.value, "all")}>
            <option value="all">Online and counter</option>
            <option value="online">Online</option>
            <option value="counter">Counter</option>
          </select>
          <label htmlFor="cr" className="cc-filter-label">Carrier</label>
          <select id="cr" className="cc-sel" value={carrier} onChange={(e) => setParam("carrier", e.target.value, "any")}>
            <option value="any">Any carrier</option>
            <option value="USPS">USPS</option>
            <option value="UPS">UPS</option>
          </select>
        </div>

        {/* Selection bar */}
        {selectedRows.length > 0 ? (
          <div role="status" className="cc-selbar">
            <span className="cc-selbar-text">
              {selectedRows.length} orders selected · {selectedItems} items · {allPaid ? "all paid" : "not all paid"}
            </span>
            <Button variant="tape" size="sm" onClick={() => bulk("Print labels")}>Print {selectedRows.length} labels</Button>
            <Button size="sm" className="cc-btn-dark" onClick={() => bulk("Print pick list")}>Print pick list</Button>
            <Button size="sm" className="cc-btn-dark" onClick={() => bulk("Mark packed")}>Mark packed</Button>
          </div>
        ) : null}
        {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}

        {/* Table */}
        <section className="cc-panel" aria-label="Orders to fulfill" style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Orders to fulfill">
            <div role="row" className="cc-or cc-or-head">
              <span role="columnheader">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={visible.length > 0 && visible.every((r) => selected.has(r.id))}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      visible.forEach((r) => (e.target.checked ? next.add(r.id) : next.delete(r.id)));
                      return next;
                    });
                  }}
                />
              </span>
              <span role="columnheader">Order</span>
              <span role="columnheader">Placed</span>
              <span role="columnheader">Customer</span>
              <span role="columnheader" className="cc-right">Items</span>
              <span role="columnheader" className="cc-right">Total</span>
              <span role="columnheader">Payment</span>
              <span role="columnheader">Fulfillment</span>
              <span role="columnheader" className="cc-right">Ship by</span>
            </div>
            {visible.map((r) => (
              <div role="row" className={`cc-or${selected.has(r.id) ? " cc-or-selected" : ""}`} key={r.id}>
                <span role="cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.id}`}
                    checked={selected.has(r.id)}
                    onChange={(e) => toggle(r.id, e.target.checked)}
                  />
                </span>
                <Link role="cell" href={`/admin/orders/${r.id}`} className="mono cc-or-id">{r.id}</Link>
                <span role="cell" className="cc-or-placed">{r.placed}</span>
                <span role="cell">{r.customer} <span className="mono cc-or-skus">· {r.skus}</span></span>
                <span role="cell" className="cc-right">{r.items}</span>
                <span role="cell" className="cc-right cc-or-total">{money(r.totalCents)}</span>
                <span role="cell"><Stamp tone={r.paymentTone}>{r.paymentLabel}</Stamp></span>
                <span role="cell"><Stamp tone={r.stageTone}>{r.stageLabel}</Stamp></span>
                <span role="cell" className="cc-right" style={r.shipBy === "11:30 AM" ? { fontWeight: 700 } : undefined}>{r.shipBy}</span>
              </div>
            ))}
            {visible.length === 0 ? (
              <div style={{ padding: "26px 20px", borderTop: "1px solid var(--rule)", color: "var(--muted)", fontSize: 13 }}>
                No orders match these filters.
              </div>
            ) : null}
          </div>
          <div className="cc-panel-foot">
            <span>Showing {visible.length} of {viewTotal} · sorted by ship-by time</span>
            <a href="#" onClick={(e) => e.preventDefault()}>Show 10 more</a>
          </div>
        </section>
      </div>
    </>
  );
}
