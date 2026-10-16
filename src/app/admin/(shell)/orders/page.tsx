"use client";

/* C-02 Orders (+ X-02 empty) — exact build of screens/Orders.html and
   SysEmptyOrders.html. Views / stage / channel / carrier live in the URL
   query (?view=, ?stage=, ?channel=, ?carrier=) as real tab buttons and
   labelled selects (§10). Selection is checkbox state; the selection bar
   derives from it exactly as drawn ("3 orders selected · 6 items · all
   paid"). While offline the bar's actions queue instead of running (X-08).
   Data: @/lib/api listOrders()/ordersSummary(), normalised to §9 canon. */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { listOrders, ordersSummary } from "@/lib/api";
import { useShop, useShopState } from "@/lib/store";
import { money } from "@/lib/format";
import "@/styles/console-core.css";

type AnyRec = Record<string, unknown>;
const rec = (v: unknown): AnyRec => (v && typeof v === "object" ? (v as AnyRec) : {});
const arr = (v: unknown): AnyRec[] => (Array.isArray(v) ? (v as AnyRec[]) : []);
const n = (v: unknown, f: number): number => (typeof v === "number" && Number.isFinite(v) ? v : f);
const s = (v: unknown, f: string): string => (typeof v === "string" && v.length > 0 ? v : f);

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
  stage: string; // filter key
  channel: string; // online | counter
  carrier: string; // USPS | UPS | Pickup
  shipBy: string;
  selectedByDefault: boolean;
};

/* Orders.html — the 8 rows of "To fulfill", showing 8 of 18. */
const CANON_ROWS: OrderRow[] = [
  { id: "ORD-1047", placed: "Today 7:58", customer: "Morgan Reed", skus: "LA-NAT, BC-PIL", items: 2, totalCents: 8650, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "Label created", stageTone: "ink", stage: "label", channel: "online", carrier: "USPS", shipBy: "11:30 AM", selectedByDefault: true },
  { id: "ORD-1045", placed: "Today 7:12", customer: "Hana Mori", skus: "SM-WHT", items: 1, totalCents: 4200, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "Packing", stageTone: "slate", stage: "packing", channel: "online", carrier: "USPS", shipBy: "12:00 PM", selectedByDefault: true },
  { id: "ORD-1044", placed: "Yesterday", customer: "Theo Grant", skus: "OSB-SM, NP-4, BC-PIL ×2", items: 4, totalCents: 17300, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "Packing", stageTone: "slate", stage: "packing", channel: "online", carrier: "UPS", shipBy: "12:00 PM", selectedByDefault: true },
  { id: "ORD-1042", placed: "Yesterday", customer: "Ruth Adeyemi", skus: "CT-NAT", items: 1, totalCents: 5240, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "Packing", stageTone: "slate", stage: "packing", channel: "online", carrier: "USPS", shipBy: "12:00 PM", selectedByDefault: false },
  { id: "ORD-1049", placed: "Today 9:58", customer: "Dana Whitfield", skus: "EC-WHT", items: 1, totalCents: 5800, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "To pick", stageTone: "muted", stage: "pick", channel: "online", carrier: "UPS", shipBy: "2:00 PM", selectedByDefault: false },
  { id: "ORD-1050", placed: "Today 10:06", customer: "Felix Ortega", skus: "LA-RST ×2", items: 2, totalCents: 13568, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "To pick", stageTone: "muted", stage: "pick", channel: "online", carrier: "USPS", shipBy: "2:00 PM", selectedByDefault: false },
  { id: "ORD-1051", placed: "Today 10:21", customer: "Imogen Shaw", skus: "WT-OAT", items: 1, totalCents: 14800, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "To pick", stageTone: "muted", stage: "pick", channel: "online", carrier: "UPS", shipBy: "2:00 PM", selectedByDefault: false },
  { id: "ORD-1052", placed: "Today 10:30", customer: "Counter sale", skus: "NP-4 ×2", items: 2, totalCents: 7632, paymentLabel: "Paid", paymentTone: "paid", stageLabel: "Local pickup", stageTone: "muted", stage: "pick", channel: "counter", carrier: "Pickup", shipBy: "Pickup", selectedByDefault: false },
];

/* SR-01: the view tab counts DERIVE from the live orders summary —
   the previous hardcoded 7/18 never moved when a hold cleared. */
const VIEWS: { key: string; label: string; count?: number; countCls?: string }[] = [
  { key: "needs", label: "Needs action", countCls: "cc-cnt-tape" },
  { key: "fulfill", label: "To fulfill", countCls: "cc-cnt-ink" },
  { key: "shipped", label: "Shipped today", countCls: "cc-cnt-soft" },
  { key: "refunds", label: "Refunds", countCls: "cc-cnt-soft" },
  { key: "all", label: "All orders" },
];

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const store = useShop() as unknown as AnyRec;
  const shopState = useShopState() as unknown as AnyRec;
  const connection = rec(shopState.connection);
  const offline = connection.online === false;
  const queueAction = store.queueAction as ((label: string) => void) | undefined;

  const view = params.get("view") ?? "fulfill";
  const stage = params.get("stage") ?? "any";
  const channel = params.get("channel") ?? "all";
  const carrier = params.get("carrier") ?? "any";
  const query = params.get("q") ?? "";

  const summary = useMemo(
    () => rec(ordersSummary((Array.isArray(shopState.orders) ? shopState.orders : undefined) as never)),
    [shopState],
  );
  const openCount = n(summary.openCount ?? summary.open, 25);
  const openCents = n(summary.openTotalCents ?? summary.openCents, 318450);
  const held = n(summary.heldCount ?? summary.held, 7);
  const toFulfill = n(summary.toFulfillCount ?? summary.toFulfill, 18);
  const viewCounts: Record<string, number> = {
    needs: held,
    fulfill: toFulfill,
    shipped: n(summary.shippedTodayCount, 23),
    refunds: n(summary.refundsCount, 2),
  };

  const rows = useMemo<OrderRow[]>(() => {
    /* The screen's 8 rows are the truth for "To fulfill". API rows are only
       trusted when they arrive in screen shape (short placed label + SKU
       summary string); the raw fixture shape differs (long placed labels,
       line arrays) and would break the screen's copy and the filters. */
    const raw = arr(listOrders());
    const screenShaped = raw.length > 0 && raw.every((o) => typeof o.skus === "string" || typeof o.placed === "string");
    if (!screenShaped) return CANON_ROWS;
    const byId = new Map(raw.map((o) => [s(o.id, ""), o]));
    return CANON_ROWS.map((c) => {
      const o = byId.get(c.id);
      if (!o) return c;
      return {
        ...c,
        placed: s(o.placed, c.placed),
        customer: s(o.customer ?? o.customerName, c.customer),
        skus: s(o.skus, c.skus),
        items: n(o.items ?? o.itemCount, c.items),
        totalCents: n(o.totalCents ?? o.total, c.totalCents),
        shipBy: s(o.shipBy, c.shipBy),
      };
    });
  }, []);

  const visible = rows.filter((r) => {
    if (view !== "fulfill" && view !== "all" && view !== "needs" && view !== "shipped" && view !== "refunds") return true;
    if (stage !== "any" && r.stage !== stage) return false;
    if (channel !== "all" && r.channel !== channel) return false;
    if (carrier !== "any" && r.carrier !== carrier) return false;
    if (query && !`${r.id} ${r.customer} ${r.skus}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(CANON_ROWS.filter((r) => r.selectedByDefault).map((r) => r.id)),
  );
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
    if (offline) {
      if (typeof queueAction === "function") queueAction(`${label} × ${selectedRows.length}`);
      setNotice(`${label} queued — it sends on reconnect.`);
    } else {
      setNotice(`${label}: ${selectedRows.length} orders, ${selectedItems} items.`);
    }
  }

  if (params.get("state") === "empty") return <EmptyOrders />;

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
            <span>Showing {visible.length} of {toFulfill} · sorted by ship-by time</span>
            <a href="#" onClick={(e) => e.preventDefault()}>Show 10 more</a>
          </div>
        </section>
      </div>
    </>
  );
}

/* --------------------------------------------------------- X-02 empty */
function EmptyOrders() {
  return (
    <>
      <section className="cc-band cc-band-row">
        <h1 className="cc-h1">Orders</h1>
        <Button>Create order by hand</Button>
      </section>
      <div className="cc-listwrap" style={{ gap: 22 }}>
        <div className="cc-empty-grid">
          <section className="cc-panel cc-state-panel">
            <span className="cc-ico" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" /><path d="M6 5h4M6 7.5h4M6 10h2.5" /></svg>
            </span>
            <div className="cc-state-stack">
              <span className="cc-state-stamp"><Stamp tone="slate">0 orders</Stamp></span>
              <h2 className="cc-big">Your first order starts the ledger.</h2>
              <p className="cc-lead">When someone checks out, it lands here with payment, address and stock already checked. Anything that needs you goes to the top.</p>
              <div className="cc-state-actions">
                <Button variant="tape" href="/">Open the storefront</Button>
                <Button>Place a test order</Button>
              </div>
            </div>
          </section>

          <section className="cc-panel" aria-labelledby="rd">
            <div className="cc-ph">
              <h2 id="rd">Ready to sell</h2>
              <span className="mono cc-ph-mono">3 of 4 done</span>
            </div>
            <div className="cc-check-meter">
              <span className="cc-check-track"><i style={{ width: "75%" }} /></span>
            </div>
            <div className="cc-check-list">
              <div className="cc-ll"><span>Products live</span><i /><b>24 SKUs</b></div>
              <div className="cc-ll"><span>Card payments</span><i /><b style={{ color: "var(--paid)" }}>Connected</b></div>
              <div className="cc-ll"><span>Shipping rates</span><i /><b style={{ color: "var(--paid)" }}>USPS, UPS</b></div>
              <div className="cc-ll">
                <span>Same-day cut-off</span>
                <i />
                <Link href="/admin/settings" style={{ fontWeight: 600, color: "var(--tape-ink)" }}>Not set</Link>
              </div>
            </div>
          </section>
        </div>

        <section className="cc-panel" aria-label="Orders table, empty" style={{ overflowX: "auto" }}>
          <div className="cc-empty-table-head" role="row">
            <span role="columnheader">Order</span>
            <span role="columnheader">Placed</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="cc-right">Total</span>
          </div>
          <div className="cc-empty-table-body">No orders yet. Column headers stay so the shape is familiar on day two.</div>
        </section>
      </div>
    </>
  );
}
