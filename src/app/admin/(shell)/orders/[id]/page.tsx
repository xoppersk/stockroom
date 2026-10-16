"use client";

/* Order detail — three approved faces on one route:
   · ORD-1048 → C-03 (screens/OrderDetail.html): Paid + Stock hold, the
     count form wired to the store (recordCountAndRelease), items with
     shelf codes, totals $110.00 + $11.40 + $6.60 = $128.00, signed history.
   · ORD-1046 → X-04 (screens/SysFailedPayment.html): declined card,
     48-hour set-aside, Retry payment via store.retryPayment.
   · ORD-1036 → C-03 shell with the refund form; an over-limit attempt
     (Rosa, $148) opens X-06 (screens/SysPermission.html) as an
     alertdialog and KEEPS everything filled in (§10).
   Other ids render the same detail shell from the fixture/canon order. */

import { Suspense, use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { getOrder, getTeam } from "@/lib/api";
import { useShop, useShopState } from "@/lib/store";
import { money } from "@/lib/format";
import "@/styles/console-core.css";

type AnyRec = Record<string, unknown>;
const rec = (v: unknown): AnyRec => (v && typeof v === "object" ? (v as AnyRec) : {});
const n = (v: unknown, f: number): number => (typeof v === "number" && Number.isFinite(v) ? v : f);

const TEAM = [
  { name: "Sheku Koroma", role: "Owner", limitCents: Number.POSITIVE_INFINITY, limitLabel: "No limit" },
  { name: "Rosa Delgado", role: "Customer service", limitCents: 10000, limitLabel: "Refunds up to $100" },
  { name: "Kofi Mensah", role: "Fulfillment", limitCents: 0, limitLabel: "No refunds" },
  { name: "Ben Hart", role: "Bookkeeper", limitCents: 0, limitLabel: "No refunds" },
];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <OrderDetailInner params={params} />
    </Suspense>
  );
}

function OrderDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (id === "ORD-1046") return <FailedPaymentOrder />;
  if (id === "ORD-1036") return <RefundOrder />;
  return <CanonOrderDetail requestedId={id} />;
}

/* ------------------------------------------------------------ C-03 shell */
function OrderHeader({
  id,
  stamps,
  sub,
}: {
  id: string;
  stamps: React.ReactNode;
  sub: string;
}) {
  return (
    <section className="cc-task-band">
      <div className="cc-band-stack">
        <Link href="/admin/orders" className="cc-backlink">← Orders</Link>
        <div className="cc-title-row">
          <h1 className="mono cc-h1-mono">{id}</h1>
          {stamps}
        </div>
        <span className="cc-sub">{sub}</span>
      </div>
      <div className="cc-btnrow">
        <Button>Print packing slip</Button>
        <Button>Refund</Button>
        <Button variant="destructive">Cancel order</Button>
      </div>
    </section>
  );
}

function CanonOrderDetail({ requestedId }: { requestedId: string }) {
  const order = useMemo(() => rec(getOrder("ORD-1048")), []);
  const id = "ORD-1048";
  const store = useShop() as unknown as AnyRec;
  const shopState = useShopState() as unknown as AnyRec;
  const recordCount = store.recordCountAndRelease as
    | ((orderId: string, counted: number) => boolean)
    | undefined;
  const connection = rec(shopState.connection);
  const offline = connection.online === false;
  const queueAction = store.queueAction as ((label: string) => void) | undefined;

  /* The store clears the hold and moves the order to Packing — read that
     back out of live state so the release is real, not just local. */
  const liveOrder = (Array.isArray(shopState.orders) ? shopState.orders : [])
    .map((o) => rec(o))
    .find((o) => o.id === id);
  const releasedInStore = liveOrder != null && liveOrder.hold == null;
  const [releasedLocal, setReleasedLocal] = useState(false);
  const released = releasedInStore || releasedLocal;

  const [counted, setCounted] = useState("4");
  const [reason, setReason] = useState("Damaged, set aside");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const countedNum = Number.parseInt(counted, 10);
  const effectCounted = Number.isFinite(countedNum) ? countedNum : 4;
  const subtotal = n(order.subtotalCents, 11000);
  const shipping = n(order.shippingCents, 1140);
  const tax = n(order.taxCents, 660);
  const total = n(order.totalCents, subtotal + shipping + tax);

  function submitCount(e: React.FormEvent) {
    e.preventDefault();
    if (typeof recordCount === "function") recordCount(id, effectCounted);
    setReleasedLocal(true);
    setNotice(`Count recorded: CT-NAT on hand 5 → ${effectCounted}. ${id} released to the fulfillment queue.`);
  }
  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (offline && typeof queueAction === "function") {
      queueAction(`Note on ${id}`);
      setNotice("Note queued — it sends on reconnect.");
    } else {
      setNotice("Note added to the order history.");
    }
    setNote("");
  }

  return (
    <>
      {requestedId !== id ? (
        <p role="status" style={{ margin: 0, padding: "10px 28px", fontSize: 12, color: "var(--slate)", background: "var(--panel)", borderBottom: "1px solid var(--rule)" }}>
          {requestedId} isn’t in the demo fixture set — showing the canonical held order, {id}.
        </p>
      ) : null}
      <OrderHeader
        id={id}
        sub="Avery Lewis · placed online October 6 at 9:41 AM · ship by 2:00 PM"
        stamps={
          <>
            <Stamp tone="paid">Paid</Stamp>
            {released ? <Stamp tone="slate">Packing</Stamp> : <Stamp tone="tape">Stock hold</Stamp>}
          </>
        }
      />

      <div className="sr-page">
        <div className="sr-cols">
          <div className="sr-col-main">
            {/* Hold panel + count form */}
            <section className="cc-hold-panel" aria-labelledby="hold">
              <div className="cc-hold-body">
                <div className="cc-band-stack" style={{ gap: 6 }}>
                  <span style={{ alignSelf: "flex-start", marginBottom: 4 }}>
                    <Stamp tone="tape">Stock hold</Stamp>
                  </span>
                  <h2 id="hold" className="cc-hold-title">Held: the tote count doesn’t match.</h2>
                  <p className="cc-hold-copy">
                    Stockroom expects 5 Canvas market totes on shelf B-14 after reserving this order.
                    Kofi counted 4 at 9:58 AM. Count again and record what’s there; the order releases
                    to packing once the count is settled.
                  </p>
                </div>
                {released ? (
                  <div className="cc-released-note" role="status">
                    <b>Count settled.</b> CT-NAT on hand is now {effectCounted}; this order keeps its
                    tote and has joined the fulfillment queue as Packing. The held count on the Orders
                    tab has dropped.
                  </div>
                ) : (
                  <form className="cc-count-form" onSubmit={submitCount}>
                    <div className="cc-field-stack">
                      <label htmlFor="cq">Counted on B-14</label>
                      <input
                        id="cq"
                        className="cc-count-input"
                        inputMode="numeric"
                        value={counted}
                        onChange={(e) => setCounted(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </div>
                    <div className="cc-field-stack" style={{ flex: "1 1 200px" }}>
                      <label htmlFor="rs">Reason</label>
                      <select id="rs" className="cc-count-select" value={reason} onChange={(e) => setReason(e.target.value)}>
                        <option>Damaged, set aside</option>
                        <option>Miscounted at last delivery</option>
                        <option>Found elsewhere</option>
                      </select>
                    </div>
                    <div className="cc-count-effect">
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>CT-NAT</span>{" "}
                      on hand <b>5 → {effectCounted}</b>. This order keeps its tote;{" "}
                      {Math.max(0, effectCounted - 1)} left to sell.
                    </div>
                    <Button variant="tape" size="lg" type="submit" disabled={offline} title={offline ? "Paused while offline" : undefined}>
                      Record count and release
                    </Button>
                  </form>
                )}
                {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}
              </div>
            </section>

            {/* Items */}
            <section className="cc-panel" aria-labelledby="items">
              <div className="cc-ph">
                <h2 id="items">Items · 2</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>Both reserved at 9:41 AM</span>
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
                  <div role="row" className="cc-li" style={{ borderTop: 0 }}>
                    <span role="cell" aria-hidden="true" className="cc-thumb mono" style={{ background: "#3A3530", color: "#FFFFFF" }}>LA</span>
                    <span role="cell">
                      <b className="cc-item-name">Linen apron — Charcoal</b>
                      <span className="mono cc-item-sku">LA-CHR</span>
                    </span>
                    <span role="cell" className="mono" style={{ fontSize: 12 }}>A-03</span>
                    <span role="cell" className="cc-right">1</span>
                    <span role="cell" className="cc-right">$64.00</span>
                    <span role="cell" style={{ fontSize: 12, color: "var(--ink-2)" }}>4 → 3 on hand</span>
                  </div>
                  <div role="row" className="cc-li" style={{ background: "#FFFCF5" }}>
                    <span role="cell" aria-hidden="true" className="cc-thumb mono" style={{ background: "#C9B79A", color: "var(--ink)" }}>CT</span>
                    <span role="cell">
                      <b className="cc-item-name">Canvas market tote</b>
                      <span className="mono cc-item-sku">CT-NAT</span>
                    </span>
                    <span role="cell" className="mono" style={{ fontSize: 12 }}>B-14</span>
                    <span role="cell" className="cc-right">1</span>
                    <span role="cell" className="cc-right">$46.00</span>
                    <span role="cell">{released ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Settled at {effectCounted}</span> : <Stamp tone="tape">Verify count</Stamp>}</span>
                  </div>
                </div>
              </div>
              <div className="cc-totals">
                <div className="cc-totals-box">
                  <div className="cc-kv"><span className="cc-kv-label">Subtotal</span><span>{money(subtotal)}</span></div>
                  <div className="cc-kv"><span className="cc-kv-label">Shipping · USPS Ground Advantage</span><span>{money(shipping)}</span></div>
                  <div className="cc-kv"><span className="cc-kv-label">Sales tax · PA 6%</span><span>{money(tax)}</span></div>
                  <div className="cc-kv cc-kv-total"><span className="cc-kv-label">Paid</span><b className="cc-total-figure">{money(total)}</b></div>
                </div>
              </div>
            </section>

            {/* Signed history */}
            <section className="cc-panel" aria-labelledby="hist">
              <div className="cc-ph">
                <h2 id="hist">History</h2>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>Every change to money and stock is recorded</span>
              </div>
              <div className="cc-history">
                {released ? (
                  <div className="cc-ev">
                    <time>Now</time>
                    <span className="cc-dot cc-dot-paid" />
                    <span><b style={{ fontWeight: 600 }}>Count recorded and hold released.</b> CT-NAT on hand 5 → {effectCounted} ({reason.toLowerCase()}). Signed: Sheku Koroma.</span>
                  </div>
                ) : null}
                <div className="cc-ev">
                  <time>9:58 AM</time>
                  <span className="cc-dot cc-dot-tape" style={{ borderColor: "var(--tape-ink)" }} />
                  <span><b style={{ fontWeight: 600 }}>Placed on hold by Kofi Mensah.</b> Shelf B-14 counted at 4 totes; system expected 5.</span>
                </div>
                <div className="cc-ev">
                  <time>9:52 AM</time>
                  <span className="cc-dot" />
                  <span>Pick list printed with 6 other orders.</span>
                </div>
                <div className="cc-ev">
                  <time>9:41 AM</time>
                  <span className="cc-dot" />
                  <span>Stock reserved: <span className="mono" style={{ fontSize: 12 }}>LA-CHR 4 → 3 · CT-NAT 6 → 5</span></span>
                </div>
                <div className="cc-ev">
                  <time>9:41 AM</time>
                  <span className="cc-dot cc-dot-paid" />
                  <span>Payment of $128.00 captured. Card ending 4417.</span>
                </div>
                <div className="cc-ev">
                  <time>9:40 AM</time>
                  <span className="cc-dot" />
                  <span>Order placed on the online store.</span>
                </div>
              </div>
              <form className="cc-note-form" onSubmit={submitNote}>
                <label htmlFor="note" className="cc-visually-hidden">Add a note to this order</label>
                <input id="note" className="cc-note-input" placeholder="Add a note for the team" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button type="submit">Add note</Button>
              </form>
            </section>
          </div>

          {/* Side column */}
          <div className="sr-col-side">
            <section className="cc-panel" aria-labelledby="fl">
              <div className="cc-ph"><h2 id="fl">Fulfillment</h2></div>
              <ol className="cc-steps">
                <li><span className="cc-step-bar cc-step-done" /><b>Placed</b><span style={{ color: "var(--slate)" }}>9:40</span></li>
                <li><span className="cc-step-bar cc-step-done" /><b>Reserved</b><span style={{ color: "var(--slate)" }}>9:41</span></li>
                <li>
                  <span className={`cc-step-bar ${released ? "cc-step-done" : "cc-step-now"}`} />
                  <b>Picked</b>
                  {released
                    ? <span style={{ color: "var(--slate)" }}>In queue</span>
                    : <span style={{ color: "var(--tape-ink)", fontWeight: 600 }}>On hold</span>}
                </li>
                <li><span className="cc-step-bar cc-step-next" /><b style={{ color: "var(--slate)" }}>Shipped</b><span style={{ color: "var(--slate)" }}>by 2:00</span></li>
              </ol>
            </section>

            <section className="cc-panel" aria-labelledby="cu">
              <div className="cc-ph">
                <h2 id="cu">Customer</h2>
                <Link href="/admin/customers/avery-lewis" style={{ fontSize: 12, fontWeight: 600 }}>Open profile</Link>
              </div>
              <div className="cc-side-block">
                <b style={{ fontSize: 15 }}>Avery Lewis</b>
                <span style={{ color: "var(--ink-2)" }}>6 orders · $614 lifetime · returning</span>
                <span className="mono" style={{ fontSize: 12 }}>avery.lewis@sevynlabs.io</span>
              </div>
              <div className="cc-side-block">
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Ship to</span>
                <span>Avery Lewis<br />2214 Fitzwater Street<br />Philadelphia, PA 19146</span>
                <span style={{ fontSize: 12, color: "var(--paid)", fontWeight: 600 }}>Address verified by carrier</span>
              </div>
            </section>

            <section className="cc-panel" aria-labelledby="pm">
              <div className="cc-ph">
                <h2 id="pm">Payment</h2>
                <Stamp tone="paid">Captured</Stamp>
              </div>
              <div className="cc-paygrid">
                <div className="cc-k cc-k-right"><span className="cc-k-label">You receive</span><b className="cc-k-value" style={{ fontSize: 26 }}>$123.99</b></div>
                <div className="cc-k"><span className="cc-k-label">Refundable</span><b className="cc-k-value" style={{ fontSize: 26 }}>$128.00</b></div>
                <div className="cc-k cc-k-b cc-k-right"><span className="cc-k-label">Method</span><b style={{ fontSize: 14 }}>Card ending 4417</b></div>
                <div className="cc-k cc-k-b"><span className="cc-k-label">Processor fee</span><b style={{ fontSize: 14 }}>$4.01</b></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------- X-04 failed payment */
function FailedPaymentOrder() {
  const store = useShop() as unknown as AnyRec;
  const shopState = useShopState() as unknown as AnyRec;
  const retryPayment = store.retryPayment as
    | ((orderId: string) => { ok: boolean; reason?: string })
    | undefined;
  const liveOrder = (Array.isArray(shopState.orders) ? shopState.orders : [])
    .map((o) => rec(o))
    .find((o) => o.id === "ORD-1046");
  const livePayment = rec(liveOrder?.payment);
  const recovered = liveOrder != null && liveOrder.paymentStatus === "paid";
  const [tried, setTried] = useState(0);
  const [notice, setNotice] = useState("");
  const attempt = Math.min(3, n(livePayment.attempts, 1) + (recovered ? 0 : tried));

  function retry() {
    const res = typeof retryPayment === "function" ? retryPayment("ORD-1046") : undefined;
    if (res && res.ok) {
      setNotice("Payment captured on retry — $214.00 collected, the board is released to the fulfillment queue.");
    } else if (res && res.reason === "max-attempts") {
      setNotice("That was the last of 3 attempts. Send Jordan a pay link instead.");
      setTried((t) => t + 1);
    } else {
      setTried((t) => Math.min(2, t + 1));
      setNotice("The bank declined again. The board stays set aside; nothing was charged.");
    }
  }

  return (
    <>
      <section className="cc-fail-band">
        <span className="cc-crumb"><Link href="/admin/orders">Orders</Link> / <span className="mono">ORD-1046</span></span>
        <div className="cc-fail-stamps">
          {recovered ? (
            <Stamp tone="paid">Paid</Stamp>
          ) : (
            <>
              <Stamp tone="problem">Payment failed</Stamp>
              <Stamp tone="paid">Recoverable</Stamp>
            </>
          )}
          <span className="mono cc-fail-time">Today, 8:15 AM</span>
        </div>
        <div className="cc-fail-head">
          <div className="cc-band-stack" style={{ gap: 12 }}>
            <h1 className="cc-big">Jordan Bell’s card was declined. Nothing has shipped.</h1>
            <p className="cc-lead">
              The bank said “insufficient funds”. We kept the order and set the board aside for 48
              hours, but didn’t deduct it from stock. Nothing was charged.
            </p>
          </div>
          <div className="cc-btnrow" style={{ justifyContent: "flex-end" }}>
            {recovered ? (
              <Button variant="tape" href="/admin/orders?view=fulfill">Open the fulfillment queue</Button>
            ) : (
              <>
                <Button variant="tape" onClick={retry}>Retry payment</Button>
                <Button>Send Jordan a pay link</Button>
                <Button variant="destructive">Cancel order</Button>
              </>
            )}
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
                <span className="mono cc-ph-mono">attempt {attempt} of 3</span>
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                <li className="cc-tl" style={{ borderTop: 0 }}>
                  <span className="mono" style={{ color: "var(--slate)" }}>08:15</span>
                  <span className="cc-tl-dot" style={{ color: "var(--problem)" }} />
                  <span>Card ending 7731 · declined at capture, attempt 1 of 3</span>
                  <b className="mono" style={{ color: "var(--problem)", fontWeight: 600 }}>$214.00</b>
                </li>
                <li className="cc-tl">
                  <span className="mono" style={{ color: "var(--slate)" }}>08:16</span>
                  <span className="cc-tl-dot" style={{ color: "var(--ink)" }} />
                  <span>Email sent to Jordan with a pay link</span>
                  <b className="mono" style={{ color: "var(--slate)", fontWeight: 600 }}>opened 08:40</b>
                </li>
                <li className="cc-tl">
                  <span className="mono" style={{ color: "var(--slate)" }}>Oct 8</span>
                  <span className="cc-tl-dot cc-tl-dot-hollow" style={{ color: "#B9B7B0" }} />
                  <span>Hold releases, order cancels itself if unpaid</span>
                  <b className="mono" style={{ color: "var(--slate)", fontWeight: 600 }}>8:15 AM</b>
                </li>
              </ol>
            </section>
          </div>
          <div className="sr-col-side">
            <section className="cc-panel" aria-labelledby="hl">
              <div className="cc-ph"><h2 id="hl">On hold, not deducted</h2></div>
              <div className="cc-ledger-block">
                <div className="cc-ll"><span>Oak serving board · Large <span className="mono" style={{ color: "var(--muted)" }}>OSB-LG</span></span><i /><b>1 × $190.00</b></div>
                <div className="cc-ll"><span>Shipping, UPS Ground</span><i /><b>$12.60</b></div>
                <div className="cc-ll"><span>Sales tax, PA 6%</span><i /><b>$11.40</b></div>
                <div className="cc-ledger-total"><span>To collect</span><b>{money(21400)}</b></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------- ORD-1036 refund + X-06 */
function RefundOrder() {
  const store = useShop() as unknown as AnyRec;
  const attemptRefund = store.attemptRefund as
    | ((orderId: string, amountCents: number, actor: AnyRec) => { ok: boolean; reason?: string; limit?: number })
    | undefined;
  /* attemptRefund takes a TeamMember — resolve the select's name to the
     real member (refundLimitCents and all) from the team fixture. */
  const members = useMemo(() => {
    try {
      return (getTeam().members ?? []) as unknown as AnyRec[];
    } catch {
      return [] as AnyRec[];
    }
  }, []);
  function memberFor(name: string): AnyRec {
    const found = members.find((m) => m.name === name);
    if (found) return found;
    const t = TEAM.find((x) => x.name === name) ?? TEAM[0]!;
    return {
      id: name.toLowerCase().replace(/[^a-z]+/g, "-"),
      name: t.name,
      role: t.role,
      email: "",
      initials: "",
      lastInLabel: "",
      isYou: false,
      refundLimitCents: Number.isFinite(t.limitCents) ? t.limitCents : null,
    };
  }

  const [actor, setActor] = useState("Rosa Delgado");
  const [amount, setAmount] = useState("148.00");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [limitCents, setLimitCents] = useState(10000);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);

  const amountCents = Math.round((Number.parseFloat(amount) || 0) * 100);
  const actorRec = TEAM.find((t) => t.name === actor) ?? TEAM[0]!;

  function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (typeof attemptRefund === "function") {
      const res = attemptRefund("ORD-1036", amountCents, memberFor(actor));
      if (res && res.ok === false && res.reason === "over-limit") {
        setLimitCents(typeof res.limit === "number" ? res.limit : actorRec.limitCents);
        setDialogOpen(true);
        requestAnimationFrame(() => {
          dialogRef.current?.querySelector<HTMLElement>("button, a")?.focus();
        });
        return;
      }
      if (res && res.ok) {
        setNotice(`Refund of ${money(amountCents)} recorded for ORD-1036. Signed: ${actor}.`);
        return;
      }
    }
    /* Fallback permission check (§9/§10: Rosa's limit is $100). */
    if (amountCents > actorRec.limitCents) {
      setLimitCents(actorRec.limitCents);
      setDialogOpen(true);
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>("button, a")?.focus();
      });
      return;
    }
    setNotice(`Refund of ${money(amountCents)} recorded for ORD-1036. Signed: ${actor}.`);
  }

  if (dialogOpen) {
    return (
      <>
        <section className="cc-band" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <span className="cc-crumb"><Link href="/admin/orders">Orders</Link> / <span className="mono">ORD-1036</span> / Refund</span>
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
              if (e.key === "Escape") setDialogOpen(false);
              if (e.key === "Tab") {
                /* focus trapped-ish: cycle within the dialog (§11) */
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
              <span style={{ alignSelf: "flex-start" }}><Stamp tone="tape">Needs a manager</Stamp></span>
              <h1 id="pd" className="cc-big">Refunds over $100 need Sheku’s OK.</h1>
              <p id="pdd" className="cc-lead">
                You’re refunding <b>{money(amountCents)}</b> on ORD-1036. Customer service can refund
                up to $100 on its own. Send it for approval and we’ll keep everything you filled in.
              </p>
              <div className="cc-dialog-facts">
                <div className="cc-ll"><span>Wool throw · Rust, returned unused</span><i /><b>{money(amountCents)}</b></div>
                <div className="cc-ll"><span>Reason</span><i /><span>Colour not as pictured</span></div>
                <div className="cc-ll"><span>Restock</span><i /><span>Yes, to <span className="mono">WT-RST</span></span></div>
              </div>
              <div className="cc-field-stack">
                <label htmlFor="nt" style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>
                  Note for Sheku <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
                </label>
                <textarea id="nt" className="cc-dialog-note" defaultValue="Throw came back sealed. Customer has bought twice before." />
              </div>
              <div className="cc-btnrow" style={{ gap: 10, paddingTop: 4 }}>
                <Button variant="tape" onClick={() => { setDialogOpen(false); setNotice(`Refund of ${money(amountCents)} sent to Sheku for approval. Your form is exactly as you left it.`); }}>
                  Send for approval
                </Button>
                <Button onClick={() => {
                  if (typeof attemptRefund === "function") attemptRefund("ORD-1036", limitCents, memberFor(actor));
                  setDialogOpen(false);
                  setNotice(`Refunded ${money(limitCents)} now; the remaining ${money(amountCents - limitCents)} waits for Sheku’s OK. Your form is kept.`);
                }}>
                  Refund {money(limitCents, { decimals: false })} now, rest later
                </Button>
                <Button onClick={() => setDialogOpen(false)} style={{ borderColor: "transparent", textDecoration: "underline", textUnderlineOffset: 3 }}>
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
              <b>Your role: {actorRec.role}</b>
            </span>
            <span style={{ color: "var(--ink-2)", paddingTop: 4 }}>Refund up to $100 · see orders and customers · message customers.</span>
            <span className="cc-role-meta">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#57534E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}><circle cx="8" cy="8" r="6.3" /><path d="M8 4.5V8l2.5 1.5" /></svg>
              <span>Sheku usually answers in about 20 minutes. You’ll get an email when it’s done.</span>
            </span>
            <Link href="/admin/settings/team" style={{ fontSize: 12, fontWeight: 600 }}>What each role can do</Link>
          </aside>
        </div>

        {/* X-06: the refund form's state lives in this parent, so closing
            the dialog returns to the form with every input kept. */}
      </>
    );
  }

  return (
    <>
      <OrderHeader
        id="ORD-1036"
        sub="Priya Nair · Wool throw — Rust · paid $148.00 · returned unused"
        stamps={
          <>
            <Stamp tone="paid">Paid</Stamp>
            <Stamp tone="tape">Refund</Stamp>
          </>
        }
      />
      <div className="sr-page">
        <div className="sr-cols">
          <div className="sr-col-main">
            <RefundFormSection
              actor={actor}
              setActor={setActor}
              amount={amount}
              setAmount={setAmount}
              onSubmit={submitRefund}
              notice={notice}
            />
            <section className="cc-panel" aria-labelledby="r-items">
              <div className="cc-ph"><h2 id="r-items">Items · 1</h2></div>
              <div className="cc-ledger-block">
                <div className="cc-ll"><span>Wool throw — Rust <span className="mono" style={{ color: "var(--muted)" }}>WT-RST</span></span><i /><b>$148.00</b></div>
                <div className="cc-ll"><span>Reason</span><i /><span>Colour not as pictured</span></div>
                <div className="cc-ll"><span>Restock</span><i /><span>Yes, to <span className="mono">WT-RST</span></span></div>
              </div>
            </section>
          </div>
          <div className="sr-col-side">
            <section className="cc-panel" aria-labelledby="r-sum">
              <div className="cc-ph"><h2 id="r-sum">Refund limits</h2></div>
              <div className="cc-ledger-block">
                {TEAM.map((t) => (
                  <div className="cc-ll" key={t.name}><span>{t.name} · {t.role}</span><i /><b>{t.limitLabel}</b></div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function RefundFormSection({
  actor,
  setActor,
  amount,
  setAmount,
  onSubmit,
  notice,
}: {
  actor: string;
  setActor: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  notice: string;
}) {
  return (
    <section className="cc-panel" aria-labelledby="rf">
      <div className="cc-ph"><h2 id="rf">Refund</h2><span style={{ fontSize: 12, color: "var(--slate)" }}>Money out is signed and kept</span></div>
      <form className="cc-refund-form" onSubmit={onSubmit}>
        <div className="cc-f">
          <label htmlFor="actor">Refunding as</label>
          <select id="actor" className="cc-in" value={actor} onChange={(e) => setActor(e.target.value)}>
            {TEAM.map((t) => (
              <option key={t.name} value={t.name}>{t.name} — {t.role}</option>
            ))}
          </select>
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
          <span style={{ fontSize: 12, color: "var(--slate)" }}>Order total $148.00 · Wool throw — Rust, returned unused.</span>
        </div>
        <div className="cc-f">
          <label htmlFor="rsn">Reason</label>
          <select id="rsn" className="cc-in" defaultValue="Colour not as pictured">
            <option>Colour not as pictured</option>
            <option>Changed their mind</option>
            <option>Arrived damaged</option>
          </select>
        </div>
        <div>
          <Button variant="tape" size="lg" type="submit">Refund {amount ? `$${amount}` : ""}</Button>
        </div>
        {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>{notice}</p> : null}
      </form>
    </section>
  );
}
