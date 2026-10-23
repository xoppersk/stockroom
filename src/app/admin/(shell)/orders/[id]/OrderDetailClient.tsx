"use client";

/* Order detail island (W-ORDERS rewire) — generic over the VIEWED order.
   The server page fetches the order (getConsoleOrder), the real actor
   and real SKU stock; this island renders the drawn C-03 / X-04 faces
   from that data and wires every write to @/lib/shop/admin-actions:
   stage advance → advanceOrderStage, cancel → cancelOrder, refund →
   refundOrder (issue_order_refund RPC; a rejection opens the X-06-style
   panel with the RPC's reason and the form kept filled, ruling 6),
   note → addOrderNote, recount → recountOrderLine (ruling 5, shown
   only for lines whose available < ordered qty).
   The drawn panels are no longer keyed to ORD-1048/1046/1036, and the
   failed-payment face has NO simulated retry: real status + events,
   actions = note / cancel / refund-when-paid (ruling 6). */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import {
  addOrderNote,
  advanceOrderStage,
  cancelOrder,
  recountOrderLine,
  refundOrder,
} from "@/lib/shop/admin-actions";
import { money } from "@/lib/format";
import type { getConsoleActor } from "@/lib/shop/admin";
import type { Order, OrderLine } from "@/lib/types";
import "@/styles/console-core.css";

export type SkuStock = {
  available: number;
  onShelf: number;
  committed: number;
  shelf: string;
};

/** The real actor contract type (W-DATA): display label on .displayRole,
 *  DB role on .role, refund ceiling on .refundLimitCents. */
type Actor = Awaited<ReturnType<typeof getConsoleActor>> | null;
type Shortage = { line: OrderLine; stock: SkuStock };

const PALETTE = ["#3A3530", "#D9D0C1", "#9A4E2E", "#ECE9E3", "#6B7F6A", "#C9B79A", "#8C5A3C", "#E8D5A8"];
function thumbBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
function isDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const lum = 0.2126 * parseInt(c.slice(0, 2), 16) + 0.7152 * parseInt(c.slice(2, 4), 16) + 0.0722 * parseInt(c.slice(4, 6), 16);
  return lum < 140;
}

function orderUuid(order: Order): string {
  return (order as Order & { uuid?: string }).uuid ?? order.id;
}

function paymentStamp(o: Order): { label: string; tone: StampTone } {
  switch (o.paymentStatus) {
    case "paid":
      return { label: "Paid", tone: "paid" };
    case "failed":
      return { label: "Payment failed", tone: "problem" };
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

/** Ruling 7 display roles: the actor contract carries the drawn label on
 *  .displayRole (W-DATA); fall back to mapping the DbRole if absent. */
const DB_ROLE_DISPLAY: Record<string, string> = {
  admin: "Owner",
  warehouse: "Fulfillment",
  support: "Customer service",
};
function displayRole(actor: Actor): string {
  if (!actor) return "Staff";
  return actor.displayRole ?? DB_ROLE_DISPLAY[actor.role] ?? actor.role;
}

function limitLabel(actor: Actor): string {
  if (!actor) return "Signed-in staff";
  if (actor.refundLimitCents === null) return "No limit";
  if (actor.refundLimitCents === 0) return "No refunds";
  return `Refunds up to ${money(actor.refundLimitCents)}`;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}’` : `${name}’s`;
}

/* ------------------------------------------------------------- island */
export function OrderDetailClient({
  order,
  actor,
  skuStock,
}: {
  order: Order;
  actor: Actor;
  skuStock: Record<string, SkuStock>;
}) {
  const router = useRouter();
  const uuid = orderUuid(order);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundAttempt, setRefundAttempt] = useState<{ amountCents: number; reason: string } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const shortages: Shortage[] = order.lines
    .filter((l) => l.sku && skuStock[l.sku] && skuStock[l.sku]!.available < l.qty)
    .map((l) => ({ line: l, stock: skuStock[l.sku!]! }));

  const refundable =
    order.payment?.refundableCents ?? Math.max(0, order.totalCents - order.refundedCents);
  const canRefund =
    refundable > 0 && (order.paymentStatus === "paid" || order.paymentStatus === "partially-refunded");
  const isFailed = order.paymentStatus === "failed" || order.payment?.status === "failed";
  const cancellable = ["held", "to-pick", "packing", "ready"].includes(order.stage);

  async function run(key: string, fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) {
    setBusy(key);
    setNotice("");
    try {
      const res = await fn();
      if (res.ok) {
        setNotice(okMsg);
        router.refresh();
      } else {
        setNotice(`That didn't go through: ${res.reason ?? "unknown error"}`);
      }
    } catch (e) {
      setNotice(`That didn't go through: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function doCancel() {
    await run("cancel", () => cancelOrder(uuid), `${order.id} cancelled.`);
  }

  async function doAdvance(toStage: string, okMsg: string) {
    await run("advance", () => advanceOrderStage(uuid, toStage), okMsg);
  }

  async function doNote(text: string): Promise<boolean> {
    setBusy("note");
    setNotice("");
    try {
      const res = await addOrderNote(uuid, text);
      if (res.ok) {
        setNotice("Note added to the order history.");
        router.refresh();
        return true;
      }
      setNotice(`Note didn't save: ${res.reason ?? "unknown error"}`);
      return false;
    } catch (e) {
      setNotice(`Note didn't save: ${e instanceof Error ? e.message : "unknown error"}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function doRefund(amountCents: number, reason: string) {
    setBusy("refund");
    setNotice("");
    try {
      const res = await refundOrder(uuid, amountCents, reason);
      if (res.ok) {
        setNotice(`Refund of ${money(amountCents)} recorded for ${order.id}. Signed: ${actor?.name ?? "staff"}.`);
        router.refresh();
      } else {
        /* Ruling 6: RPC rejection surfaces in the X-06-style panel,
           with everything the user filled in kept. */
        setRefundAttempt({ amountCents, reason });
        setRefundError(res.reason ?? "The refund was rejected.");
        requestAnimationFrame(() => {
          dialogRef.current?.querySelector<HTMLElement>("button, a")?.focus();
        });
      }
    } catch (e) {
      setRefundAttempt({ amountCents, reason });
      setRefundError(e instanceof Error ? e.message : "The refund was rejected.");
    } finally {
      setBusy(null);
    }
  }

  async function doRecount(line: OrderLine, countedQty: number) {
    await run(
      `recount-${line.sku}`,
      () => recountOrderLine(uuid, line.sku ?? "", countedQty),
      `Count recorded for ${line.sku}. The order history has the signed entry.`,
    );
  }

  /* ---- X-06-style refund rejection panel (keeps the form's values) ---- */
  if (refundError) {
    return (
      <>
        <section className="cc-band" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <span className="cc-crumb"><Link href="/admin/orders">Orders</Link> / <span className="mono">{order.id}</span> / Refund</span>
        </section>
        <div className="cc-dialog-wrap">
          <section
            className="cc-panel cc-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pd"
            aria-describedby="pdd"
            ref={dialogRef}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRefundError(null);
              if (e.key === "Tab") {
                const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
                  'a[href], button:not([disabled]), textarea, input, select',
                );
                if (!focusables || focusables.length === 0) return;
                const list = Array.from(focusables);
                const first = list[0]!;
                const last = list[list.length - 1]!;
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className="cc-dialog-tapebar" />
            <div className="cc-dialog-body">
              <span style={{ alignSelf: "flex-start" }}><Stamp tone="problem">Refund stopped</Stamp></span>
              <h1 id="pd" className="cc-big">That refund didn’t go through.</h1>
              <p id="pdd" className="cc-lead">
                You tried to refund <b>{refundAttempt ? money(refundAttempt.amountCents) : ""}</b> on {order.id}.
                The database refused it: {refundError} Nothing was recorded, and your
                form is exactly as you left it.
              </p>
              <div className="cc-dialog-facts">
                <div className="cc-ll"><span>Order</span><i /><b className="mono">{order.id}</b></div>
                <div className="cc-ll"><span>Reason</span><i /><span>{refundAttempt?.reason ?? "—"}</span></div>
                <div className="cc-ll"><span>Refundable on this order</span><i /><b>{money(refundable)}</b></div>
              </div>
              <div className="cc-btnrow" style={{ gap: 10, paddingTop: 4 }}>
                <Button variant="tape" onClick={() => setRefundError(null)}>
                  Back to order
                </Button>
              </div>
            </div>
          </section>

          <aside className="cc-panel cc-role-panel">
            <span className="cc-role-head">
              <span className="cc-ico" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5 13.5 3.5v4.2c0 3.2-2.3 5.7-5.5 6.8-3.2-1.1-5.5-3.6-5.5-6.8V3.5z" /><path d="M5.6 8 7.3 9.6 10.6 6.3" /></svg>
              </span>
              <b>Your role: {displayRole(actor)}</b>
            </span>
            <span style={{ color: "var(--ink-2)", paddingTop: 4 }}>
              {actor ? `${actor.name} · ${limitLabel(actor)}.` : "Refunds are issued by admin and support roles."} Refund
              permission comes from the database role, not from a per-person dollar table.
            </span>
            <Link href="/admin/settings/team" style={{ fontSize: 12, fontWeight: 600 }}>What each role can do</Link>
          </aside>
        </div>
      </>
    );
  }

  if (isFailed) {
    return (
      <FailedPaymentView
        order={order}
        notice={notice}
        busy={busy}
        cancellable={cancellable}
        onCancel={doCancel}
        onNote={doNote}
      />
    );
  }

  const pay = paymentStamp(order);
  const itemCount = order.lines.reduce((a, l) => a + l.qty, 0);
  const shipLines = order.shipTo ? shipToLines(order.shipTo, order.customerName) : [];

  return (
    <>
      <OrderHeader
        order={order}
        canRefund={canRefund}
        cancellable={cancellable}
        busy={busy}
        onCancel={doCancel}
        stamps={
          <>
            <Stamp tone={pay.tone}>{pay.label}</Stamp>
            {order.hold ? (
              <Stamp tone={order.hold.tone}>{order.hold.title}</Stamp>
            ) : (
              <Stamp tone={stageTone(order.stage)}>{order.stageLabel}</Stamp>
            )}
          </>
        }
      />
      {notice ? (
        <p role="status" style={{ margin: 0, padding: "10px 28px", fontSize: 13, color: "var(--slate)", background: "var(--panel)", borderBottom: "1px solid var(--rule)" }}>
          {notice}
        </p>
      ) : null}

      <div className="sr-page">
        <div className="sr-cols">
          <div className="sr-col-main">
            {/* Hold / shortage panel + recount form (ruling 5) */}
            {order.hold || shortages.length > 0 ? (
              <section className="cc-hold-panel" aria-labelledby="hold">
                <div className="cc-hold-body">
                  <div className="cc-band-stack" style={{ gap: 6 }}>
                    <span style={{ alignSelf: "flex-start", marginBottom: 4 }}>
                      <Stamp tone={order.hold?.tone ?? "tape"}>{order.hold?.title ?? "Stock shortage"}</Stamp>
                    </span>
                    <h2 id="hold" className="cc-hold-title">
                      {order.hold ? `Held: ${order.hold.reason}` : "A line on this order is short on stock."}
                    </h2>
                    <p className="cc-hold-copy">
                      {order.hold?.detail ??
                        "Count the shelf and record what's there; the recount writes a signed stock adjustment against this order."}
                    </p>
                  </div>
                  {shortages.map(({ line, stock }) => (
                    <RecountForm
                      key={line.sku}
                      line={line}
                      stock={stock}
                      holdCounted={
                        order.hold?.sku === line.sku ? order.hold.countedCount : undefined
                      }
                      systemCount={
                        order.hold?.sku === line.sku ? order.hold.systemCount : undefined
                      }
                      busy={busy === `recount-${line.sku}`}
                      onRecount={(counted) => doRecount(line, counted)}
                    />
                  ))}
                  {shortages.length === 0 && order.hold ? (
                    <p style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>
                      No line is short against live stock right now — the hold clears from the
                      fulfillment actions once the underlying check is settled.
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Items */}
            <section className="cc-panel" aria-labelledby="items">
              <div className="cc-ph">
                <h2 id="items">Items · {itemCount}</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>{order.placedLabel}</span>
              </div>
              <div className="cc-scroll">
                <div role="table" aria-label="Line items">
                  <div role="row" className="cc-li cc-li-head">
                    <span role="columnheader"></span>
                    <span role="columnheader">Product</span>
                    <span role="columnheader">Shelf</span>
                    <span role="columnheader" className="cc-right">Qty</span>
                    <span role="columnheader" className="cc-right">Price</span>
                    <span role="columnheader">Stock</span>
                  </div>
                  {order.lines.map((l, i) => {
                    const stock = l.sku ? skuStock[l.sku] : undefined;
                    const short = !!stock && stock.available < l.qty;
                    const bg = thumbBg(l.sku ?? l.label);
                    const thumb = l.sku ? l.sku.split("-")[0] : l.label.slice(0, 2).toUpperCase();
                    return (
                      <div role="row" className="cc-li" key={`${l.sku ?? l.label}-${i}`} style={i === 0 ? { borderTop: 0 } : short ? { background: "#FFFCF5" } : undefined}>
                        <span role="cell" aria-hidden="true" className="cc-thumb mono" style={{ background: bg, color: isDark(bg) ? "#FFFFFF" : "var(--ink)" }}>{thumb}</span>
                        <span role="cell">
                          <b className="cc-item-name">{l.label}</b>
                          {l.sku ? <span className="mono cc-item-sku">{l.sku}</span> : null}
                        </span>
                        <span role="cell" className="mono" style={{ fontSize: 12 }}>{l.shelf ?? stock?.shelf ?? "—"}</span>
                        <span role="cell" className="cc-right">{l.qty}</span>
                        <span role="cell" className="cc-right">{money(l.unitPriceCents)}</span>
                        <span role="cell" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                          {stock
                            ? short
                              ? <Stamp tone="tape">Verify count</Stamp>
                              : `${stock.available} available`
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="cc-totals">
                <div className="cc-totals-box">
                  <div className="cc-kv"><span className="cc-kv-label">Subtotal</span><span>{money(order.subtotalCents)}</span></div>
                  <div className="cc-kv"><span className="cc-kv-label">Shipping</span><span>{money(order.shippingCents)}</span></div>
                  <div className="cc-kv"><span className="cc-kv-label">Sales tax</span><span>{money(order.taxCents)}</span></div>
                  <div className="cc-kv cc-kv-total"><span className="cc-kv-label">{order.paymentStatus === "paid" ? "Paid" : "Total"}</span><b className="cc-total-figure">{money(order.totalCents)}</b></div>
                  {order.refundedCents > 0 ? (
                    <div className="cc-kv"><span className="cc-kv-label">Refunded so far</span><span>{money(order.refundedCents)}</span></div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Refund (money out is signed and kept; RPC-backed) */}
            {canRefund ? (
              <RefundSection
                order={order}
                actor={actor}
                refundable={refundable}
                busy={busy === "refund"}
                onRefund={doRefund}
              />
            ) : null}

            {/* Signed history (order_events) + note form */}
            <section className="cc-panel" aria-labelledby="hist">
              <div className="cc-ph">
                <h2 id="hist">History</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>Every change to money and stock is recorded</span>
              </div>
              <div className="cc-history">
                {(order.history ?? []).map((h, i) => (
                  <div className="cc-ev" key={`${h.timeLabel}-${i}`}>
                    <time>{h.timeLabel}</time>
                    <span className={dotClass(h.text)} style={dotStyle(h.text)} />
                    <span>{h.text}</span>
                  </div>
                ))}
                {(order.history ?? []).length === 0 ? (
                  <div className="cc-ev">
                    <time>—</time>
                    <span className="cc-dot" />
                    <span>No events recorded for this order yet.</span>
                  </div>
                ) : null}
              </div>
              <NoteForm busy={busy === "note"} onNote={doNote} />
            </section>
          </div>

          {/* Side column */}
          <div className="sr-col-side">
            <FulfillmentPanel order={order} busy={busy} onAdvance={doAdvance} />

            <section className="cc-panel" aria-labelledby="cu">
              <div className="cc-ph">
                <h2 id="cu">Customer</h2>
                {order.customerSlug ? (
                  <Link href={`/admin/customers/${order.customerSlug}`} style={{ fontSize: 12, fontWeight: 600 }}>Open profile</Link>
                ) : null}
              </div>
              <div className="cc-side-block">
                <b style={{ fontSize: 15 }}>{order.customerName}</b>
                <span style={{ color: "var(--ink-2)" }}>{order.channel === "counter" ? "Counter sale" : "Online order"}</span>
              </div>
              {shipLines.length > 0 ? (
                <div className="cc-side-block">
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Ship to</span>
                  <span>
                    {shipLines.map((line, i) => (
                      <span key={i}>{line}{i < shipLines.length - 1 ? <br /> : null}</span>
                    ))}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="cc-panel" aria-labelledby="pm">
              <div className="cc-ph">
                <h2 id="pm">Payment</h2>
                <Stamp tone={pay.tone}>{pay.label}</Stamp>
              </div>
              {order.payment ? (
                <div className="cc-paygrid">
                  {order.payment.receivedCents != null ? (
                    <div className="cc-k cc-k-right"><span className="cc-k-label">You receive</span><b className="cc-k-value" style={{ fontSize: 26 }}>{money(order.payment.receivedCents)}</b></div>
                  ) : null}
                  <div className="cc-k"><span className="cc-k-label">Refundable</span><b className="cc-k-value" style={{ fontSize: 26 }}>{money(refundable)}</b></div>
                  {order.payment.cardLast4 ? (
                    <div className="cc-k cc-k-b cc-k-right"><span className="cc-k-label">Method</span><b style={{ fontSize: 14 }}>Card ending {order.payment.cardLast4}</b></div>
                  ) : null}
                  {order.payment.processorFeeCents != null ? (
                    <div className="cc-k cc-k-b"><span className="cc-k-label">Processor fee</span><b style={{ fontSize: 14 }}>{money(order.payment.processorFeeCents)}</b></div>
                  ) : null}
                </div>
              ) : (
                <div className="cc-ledger-block">
                  <div className="cc-ll"><span>Total</span><i /><b>{money(order.totalCents)}</b></div>
                  <div className="cc-ll"><span>Refundable</span><i /><b>{money(refundable)}</b></div>
                  {order.refundedCents > 0 ? (
                    <div className="cc-ll"><span>Refunded so far</span><i /><b>{money(order.refundedCents)}</b></div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function dotClass(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("payment") || t.includes("captured") || t.includes("refund")) return "cc-dot cc-dot-paid";
  if (t.includes("hold") || t.includes("count")) return "cc-dot cc-dot-tape";
  return "cc-dot";
}
function dotStyle(text: string): React.CSSProperties | undefined {
  return dotClass(text).includes("tape") ? { borderColor: "var(--tape-ink)" } : undefined;
}

function shipToLines(shipTo: string, customerName: string): string[] {
  const parts = shipTo.split(/,\s*/).filter(Boolean);
  if (parts.length > 1 && parts[0] === customerName) return parts.slice(1);
  return parts;
}

/* ------------------------------------------------------------ header */
function OrderHeader({
  order,
  stamps,
  canRefund,
  cancellable,
  busy,
  onCancel,
}: {
  order: Order;
  stamps: React.ReactNode;
  canRefund: boolean;
  cancellable: boolean;
  busy: string | null;
  onCancel: () => void;
}) {
  const sub = `${order.customerName} · placed ${order.channel === "counter" ? "at the counter" : "online"} ${order.placedLabel} · ship by ${order.shipByLabel}`;
  return (
    <section className="cc-task-band">
      <div className="cc-band-stack">
        <Link href="/admin/orders" className="cc-backlink">← Orders</Link>
        <div className="cc-title-row">
          <h1 className="mono cc-h1-mono">{order.id}</h1>
          {stamps}
        </div>
        <span className="cc-sub">{sub}</span>
      </div>
      <div className="cc-btnrow">
        <Button>Print packing slip</Button>
        {canRefund ? <Button href="#refund">Refund</Button> : null}
        {cancellable ? (
          <Button variant="destructive" onClick={onCancel} disabled={busy === "cancel"}>
            Cancel order
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------ recount form */
function RecountForm({
  line,
  stock,
  holdCounted,
  systemCount,
  busy,
  onRecount,
}: {
  line: OrderLine;
  stock: SkuStock;
  holdCounted?: number;
  systemCount?: number;
  busy: boolean;
  onRecount: (counted: number) => void;
}) {
  const [counted, setCounted] = useState(String(holdCounted ?? stock.available));
  const [reason, setReason] = useState("Damaged, set aside");
  const countedNum = Number.parseInt(counted, 10);
  const effectCounted = Number.isFinite(countedNum) ? countedNum : stock.available;
  const system = systemCount ?? stock.onShelf;
  const shelf = line.shelf ?? stock.shelf;

  return (
    <form
      className="cc-count-form"
      onSubmit={(e) => {
        e.preventDefault();
        onRecount(effectCounted);
      }}
    >
      <div className="cc-field-stack">
        <label htmlFor={`cq-${line.sku}`}>Counted{line.sku ? ` · ${line.sku}` : ""}{shelf ? ` on ${shelf}` : ""}</label>
        <input
          id={`cq-${line.sku}`}
          className="cc-count-input"
          inputMode="numeric"
          value={counted}
          onChange={(e) => setCounted(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>
      <div className="cc-field-stack" style={{ flex: "1 1 200px" }}>
        <label htmlFor={`rs-${line.sku}`}>Reason</label>
        <select id={`rs-${line.sku}`} className="cc-count-select" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Damaged, set aside</option>
          <option>Miscounted at last delivery</option>
          <option>Found elsewhere</option>
        </select>
      </div>
      <div className="cc-count-effect">
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{line.sku}</span>{" "}
        available <b>{stock.available}</b> against <b>{line.qty}</b> ordered · system on hand {system}.{" "}
        Recording the count writes a signed recount adjustment ({reason.toLowerCase()}).
      </div>
      <Button variant="tape" size="lg" type="submit" disabled={busy}>
        Record count
      </Button>
    </form>
  );
}

/* --------------------------------------------------------- note form */
function NoteForm({
  busy,
  onNote,
}: {
  busy: boolean;
  onNote: (text: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="cc-note-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        const ok = await onNote(note.trim());
        if (ok) setNote("");
      }}
    >
      <label htmlFor="note" className="cc-visually-hidden">Add a note to this order</label>
      <input id="note" className="cc-note-input" placeholder="Add a note for the team" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="submit" disabled={busy}>Add note</Button>
    </form>
  );
}

/* ------------------------------------------------------ refund form */
function RefundSection({
  order,
  actor,
  refundable,
  busy,
  onRefund,
}: {
  order: Order;
  actor: Actor;
  refundable: number;
  busy: boolean;
  onRefund: (amountCents: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState((refundable / 100).toFixed(2));
  const [reason, setReason] = useState("Colour not as pictured");
  const amountCents = Math.round((Number.parseFloat(amount) || 0) * 100);
  const firstLine = order.lines[0];

  return (
    <section className="cc-panel" aria-labelledby="rf" id="refund">
      <div className="cc-ph"><h2 id="rf">Refund</h2><span style={{ fontSize: 12, color: "var(--slate)" }}>Money out is signed and kept</span></div>
      <form
        className="cc-refund-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (amountCents > 0) onRefund(amountCents, reason);
        }}
      >
        <div className="cc-f">
          <label>Refunding as</label>
          <span style={{ fontSize: 14 }}>
            {actor ? `${actor.name} — ${displayRole(actor)}` : "Signed-in staff"} · {limitLabel(actor)}
          </span>
        </div>
        <div className="cc-f">
          <label htmlFor="amt">Amount (USD)</label>
          <input
            id="amt"
            className="cc-in mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <span style={{ fontSize: 12, color: "var(--slate)" }}>
            Order total {money(order.totalCents)} · refundable {money(refundable)}
            {firstLine ? ` · ${firstLine.label}` : ""}.
          </span>
        </div>
        <div className="cc-f">
          <label htmlFor="rsn">Reason</label>
          <select id="rsn" className="cc-in" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option>Colour not as pictured</option>
            <option>Changed their mind</option>
            <option>Arrived damaged</option>
          </select>
        </div>
        <div>
          <Button variant="tape" size="lg" type="submit" disabled={busy}>
            Refund {amount ? `$${amount}` : ""}
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------- fulfillment panel */
const STAGE_RANK: Record<Order["stage"], number> = {
  held: 1,
  "to-pick": 1,
  packing: 2,
  ready: 3,
  shipped: 4,
  delivered: 5,
};
const NEXT_STAGE: Partial<Record<Order["stage"], { to: string; label: string }>> = {
  held: { to: "to-pick", label: "Release to pick" },
  "to-pick": { to: "packing", label: "Start packing" },
  packing: { to: "ready", label: "Mark ready" },
  ready: { to: "shipped", label: "Mark shipped" },
};

function FulfillmentPanel({
  order,
  busy,
  onAdvance,
}: {
  order: Order;
  busy: string | null;
  onAdvance: (toStage: string, okMsg: string) => void;
}) {
  const rank = STAGE_RANK[order.stage] ?? 1;
  const next = NEXT_STAGE[order.stage];
  const steps: { label: string; state: "done" | "now" | "next"; meta: string }[] = [
    { label: "Placed", state: "done", meta: order.placedDay === "today" ? "Today" : order.placedDay === "yesterday" ? "Yesterday" : "Earlier" },
    { label: "Reserved", state: order.paymentStatus === "paid" || rank >= 1 ? "done" : "next", meta: order.paymentStatus === "paid" ? "Stock held" : "—" },
    {
      label: "Picked",
      state: rank >= 2 ? "done" : "now",
      meta: rank >= 2 ? "Done" : order.hold ? "On hold" : order.stageLabel,
    },
    {
      label: "Shipped",
      state: rank >= 4 ? "done" : "next",
      meta: rank >= 4 ? order.stageLabel : `by ${order.shipByLabel}`,
    },
  ];
  return (
    <section className="cc-panel" aria-labelledby="fl">
      <div className="cc-ph"><h2 id="fl">Fulfillment</h2></div>
      <ol className="cc-steps">
        {steps.map((s) => (
          <li key={s.label}>
            <span className={`cc-step-bar ${s.state === "done" ? "cc-step-done" : s.state === "now" ? "cc-step-now" : "cc-step-next"}`} />
            <b style={s.state === "next" ? { color: "var(--slate)" } : undefined}>{s.label}</b>
            <span style={{ color: s.state === "now" && order.hold ? "var(--tape-ink)" : "var(--slate)", fontWeight: s.state === "now" && order.hold ? 600 : undefined }}>{s.meta}</span>
          </li>
        ))}
      </ol>
      {next ? (
        <div style={{ padding: "0 20px 16px" }}>
          <Button
            variant="tape"
            disabled={busy === "advance"}
            onClick={() => onAdvance(next.to, `${order.id} moved to ${next.label.replace(/^(Start|Mark|Release to)\s*/i, "") || next.to}.`)}
          >
            {next.label}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------- X-04 failed payment face */
function FailedPaymentView({
  order,
  notice,
  busy,
  cancellable,
  onCancel,
  onNote,
}: {
  order: Order;
  notice: string;
  busy: string | null;
  cancellable: boolean;
  onCancel: () => void;
  onNote: (text: string) => Promise<boolean>;
}) {
  const payment = order.payment;
  const decline = payment?.declineReason ?? "declined at capture";
  const history = order.history ?? [];
  const itemCount = order.lines.reduce((a, l) => a + l.qty, 0);
  void itemCount;

  return (
    <>
      <section className="cc-fail-band">
        <span className="cc-crumb"><Link href="/admin/orders">Orders</Link> / <span className="mono">{order.id}</span></span>
        <div className="cc-fail-stamps">
          <Stamp tone="problem">Payment failed</Stamp>
          <Stamp tone="paid">Recoverable</Stamp>
          <span className="mono cc-fail-time">{order.placedLabel}</span>
        </div>
        <div className="cc-fail-head">
          <div className="cc-band-stack" style={{ gap: 12 }}>
            <h1 className="cc-big">{possessive(order.customerName)} card was declined. Nothing has shipped.</h1>
            <p className="cc-lead">
              The bank said “{decline}”.{" "}
              {order.hold?.detail ??
                "We kept the order, but didn't deduct it from stock. Nothing was charged."}
            </p>
          </div>
          <div className="cc-btnrow" style={{ justifyContent: "flex-end" }}>
            <Button href="#order-note">Add a note</Button>
            {cancellable ? (
              <Button variant="destructive" onClick={onCancel} disabled={busy === "cancel"}>
                Cancel order
              </Button>
            ) : null}
          </div>
        </div>
        {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}
      </section>

      <div className="sr-page">
        <div className="sr-cols">
          <div className="sr-col-main">
            <section className="cc-panel" aria-labelledby="wt">
              <div className="cc-ph">
                <h2 id="wt">What we tried</h2>
                {payment?.attempts != null ? (
                  <span className="mono cc-ph-mono">attempt {payment.attempts} of {payment.maxAttempts ?? 3}</span>
                ) : null}
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {history.length > 0 ? (
                  history.map((h, i) => (
                    <li className="cc-tl" key={`${h.timeLabel}-${i}`} style={i === 0 ? { borderTop: 0 } : undefined}>
                      <span className="mono" style={{ color: "var(--slate)" }}>{h.timeLabel}</span>
                      <span
                        className={`cc-tl-dot${i > 0 ? " cc-tl-dot-hollow" : ""}`}
                        style={{ color: h.text.toLowerCase().includes("declin") || h.text.toLowerCase().includes("fail") ? "var(--problem)" : "var(--ink)" }}
                      />
                      <span>{h.text}</span>
                      {i === 0 ? <b className="mono" style={{ color: "var(--problem)", fontWeight: 600 }}>{money(order.totalCents)}</b> : <span />}
                    </li>
                  ))
                ) : (
                  <li className="cc-tl" style={{ borderTop: 0 }}>
                    <span className="mono" style={{ color: "var(--slate)" }}>{payment?.lastAttemptLabel ?? "—"}</span>
                    <span className="cc-tl-dot" style={{ color: "var(--problem)" }} />
                    <span>
                      Card{payment?.cardLast4 ? ` ending ${payment.cardLast4}` : ""} · declined at capture
                      {payment?.attempts != null ? `, attempt ${payment.attempts} of ${payment.maxAttempts ?? 3}` : ""}
                    </span>
                    <b className="mono" style={{ color: "var(--problem)", fontWeight: 600 }}>{money(order.totalCents)}</b>
                  </li>
                )}
                {payment?.holdExpiresLabel ? (
                  <li className="cc-tl">
                    <span className="mono" style={{ color: "var(--slate)" }}>{payment.holdExpiresLabel}</span>
                    <span className="cc-tl-dot cc-tl-dot-hollow" style={{ color: "#B9B7B0" }} />
                    <span>Hold releases, order cancels itself if unpaid</span>
                    <span />
                  </li>
                ) : null}
              </ol>
            </section>

            <section className="cc-panel" aria-labelledby="fn" id="order-note">
              <div className="cc-ph">
                <h2 id="fn">Add a note</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>Notes are signed and kept in the order history</span>
              </div>
              <NoteForm busy={busy === "note"} onNote={onNote} />
            </section>
          </div>
          <div className="sr-col-side">
            <section className="cc-panel" aria-labelledby="hl">
              <div className="cc-ph"><h2 id="hl">On hold, not deducted</h2></div>
              <div className="cc-ledger-block">
                {order.lines.map((l, i) => (
                  <div className="cc-ll" key={`${l.sku ?? l.label}-${i}`}>
                    <span>{l.label} {l.sku ? <span className="mono" style={{ color: "var(--muted)" }}>{l.sku}</span> : null}</span>
                    <i />
                    <b>{l.qty} × {money(l.unitPriceCents)}</b>
                  </div>
                ))}
                <div className="cc-ll"><span>Shipping</span><i /><b>{money(order.shippingCents)}</b></div>
                <div className="cc-ll"><span>Sales tax</span><i /><b>{money(order.taxCents)}</b></div>
                <div className="cc-ledger-total"><span>To collect</span><b>{money(order.totalCents)}</b></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
