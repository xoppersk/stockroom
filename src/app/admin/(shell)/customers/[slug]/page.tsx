"use client";

/* O-04 — /admin/customers/[slug] (screens/CustomerDetail.html).
 * avery-lewis is canonical: ORD-1048 hold notice, 6 orders, notes, and the
 * ledger ($614 spent · average $102.33 via averageOrderCents()). Other
 * slugs render the same layout from their record; a held last order builds
 * its notice from that order's hold data. */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { averageOrderCents, getCustomer, getOrder } from "@/lib/api";
import { useActor } from "@/lib/store";
import { money } from "@/lib/format";

const AVATAR_FALLBACK: Record<string, string> = {
  "avery-lewis": "#3A3530",
  "jordan-bell": "#57534E",
  "kettle-crumb-cafe": "#1C1917",
  "morgan-reed": "#44403C",
  "theo-grant": "#57534E",
  "imogen-shaw": "#A15C00",
  "hana-mori": "#44403C",
  "lucia-ferreira": "#57534E",
};

const AVERY_HOLD = {
  stamp: "Stock hold",
  title: "Today’s order is on hold.",
  text: "ORD-1048 is waiting on a tote count. If it can’t ship by 2:00 PM, let Avery know before she notices the delay.",
};

function statusTone(label: string): StampTone {
  if (label === "Stock hold" || label === "On hold") return "tape";
  if (label === "Delivered" || label === "Shipped") return "paid";
  if (label === "Payment failed") return "problem";
  return "ink";
}

function tagTone(tag: string): StampTone {
  if (tag === "Restock alert") return "tape";
  if (tag === "New") return "muted";
  return "ink";
}

/** Notes store their lead-in inside the text ("Email from Avery: …") —
 *  the screen bolds everything up to the colon. */
function NoteText({ text }: { text: string }) {
  const idx = text.indexOf(": ");
  if (idx > 0 && idx < 40) {
    return (
      <>
        <b>{text.slice(0, idx + 1)}</b> {text.slice(idx + 2)}
      </>
    );
  }
  return <>{text}</>;
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const actor = useActor();

  const customer = useMemo(() => getCustomer(slug), [slug]);
  const [extraNotes, setExtraNotes] = useState<
    { dateLabel: string; text: string }[]
  >([]);
  const [noteText, setNoteText] = useState("");

  if (!customer) {
    return (
      <div className="sr-page">
        <section className="panel" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 12px" }}>
            No customer record for <span className="mono">{slug}</span>.
          </p>
          <Link className="btn" href="/admin/customers">
            ← Customers
          </Link>
        </section>
      </div>
    );
  }

  const lastOrder = customer.lastOrder
    ? getOrder(customer.lastOrder.orderId)
    : undefined;
  const hold =
    slug === "avery-lewis" && lastOrder?.hold
      ? { orderId: lastOrder.id, ...AVERY_HOLD }
      : lastOrder?.hold
        ? {
            orderId: lastOrder.id,
            stamp: lastOrder.hold.title,
            title:
              customer.lastOrder?.dateLabel === "today"
                ? "Today’s order is on hold."
                : "This order is on hold.",
            text: `${lastOrder.hold.reason}${lastOrder.hold.detail ? ` ${lastOrder.hold.detail}` : ""}`,
          }
        : null;

  const notes = [...extraNotes, ...customer.notes];
  const tag = customer.tags[0];
  const addressLines = customer.address
    ? [
        customer.address.split(", ")[0],
        customer.address.split(", ").slice(1).join(", "),
      ].filter(Boolean)
    : [];

  function addNote(e: React.FormEvent) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    setExtraNotes((prev) => [
      { dateLabel: "Oct 6", text: `Note by ${actor.name.split(" ")[0]}: ${text}` },
      ...prev,
    ]);
    setNoteText("");
  }

  return (
    <>
      <section className="ops-detail-band">
        <div className="ops-detail-id">
          <span
            className="ops-avatar-lg"
            aria-hidden="true"
            style={{ background: AVATAR_FALLBACK[slug] ?? "#57534E" }}
          >
            {customer.initials}
          </span>
          <div className="ops-stack" style={{ gap: 8 }}>
            <Link className="ops-backlink" href="/admin/customers">
              ← Customers
            </Link>
            <div className="ops-detail-name">
              <h1 className="ops-h1">{customer.name}</h1>
              {tag && <Stamp tone={tagTone(tag)}>{tag}</Stamp>}
            </div>
            <span className="ops-detail-meta">
              {customer.sinceFullLabel} · {customer.location}
              {customer.lastOrder
                ? ` · last order ${customer.lastOrder.dateLabel}`
                : ""}
            </span>
          </div>
        </div>
        <div className="ops-detail-actions">
          <a className="btn" href={`mailto:${customer.email}`}>
            Email {customer.name.split(/\s+/)[0]}
          </a>
          <Link className="btn tape" href="/admin/orders">
            Create order
          </Link>
        </div>
      </section>

      <div className="sr-page">
        <div className="ops-zero-grid">
          <div className="ops-stack">
            {hold && (
              <section className="panel ops-hold-panel" aria-labelledby="ops-att">
                <div className="ops-hold-inner">
                  <div className="ops-hold-copy">
                    <span className="stamp" style={{ color: "var(--tape-ink)" }}>
                      {hold.stamp}
                    </span>
                    <h2 id="ops-att">{hold.title}</h2>
                    <span>{hold.text}</span>
                  </div>
                  <Link
                    className="btn tape"
                    href={`/admin/orders/${hold.orderId}`}
                  >
                    Open {hold.orderId}
                  </Link>
                </div>
              </section>
            )}

            <section className="panel" aria-labelledby="ops-oh">
              <div className="ph">
                <h2 id="ops-oh">Orders · {customer.orderHistory.length}</h2>
                <span className="ph-note">Newest first</span>
              </div>
              <div className="ops-scroll">
                <div role="table" aria-label="Orders">
                  <div role="row" className="orr head">
                    <span role="columnheader">Order</span>
                    <span role="columnheader">Date</span>
                    <span role="columnheader">Items</span>
                    <span role="columnheader" style={{ textAlign: "right" }}>
                      Total
                    </span>
                    <span role="columnheader">Status</span>
                  </div>
                  {customer.orderHistory.map((o) => (
                    <Link
                      role="row"
                      className="orr"
                      key={o.orderId}
                      href={`/admin/orders/${o.orderId}`}
                    >
                      <span role="cell" className="mono">
                        {o.orderId}
                      </span>
                      <span role="cell">{o.dateLabel}</span>
                      <span role="cell">{o.itemsLabel}</span>
                      <span role="cell" className="total cond">
                        {money(o.totalCents)}
                      </span>
                      <span role="cell">
                        <Stamp tone={statusTone(o.statusLabel)}>
                          {o.statusLabel}
                        </Stamp>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel" aria-labelledby="ops-nt">
              <div className="ph">
                <h2 id="ops-nt">Notes and contact</h2>
              </div>
              <div className="ops-notes-body">
                {notes.map((n, i) => (
                  <div className="ops-note-row" key={`${n.dateLabel}-${i}`}>
                    <span className="when">{n.dateLabel}</span>
                    <span>
                      <NoteText text={n.text} />
                    </span>
                  </div>
                ))}
              </div>
              <form className="ops-note-form" onSubmit={addNote}>
                <label className="sr-only" htmlFor="ops-nn">
                  Add a note about {customer.name}
                </label>
                <input
                  id="ops-nn"
                  placeholder="Add a note the team will see on every order"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button className="btn" type="submit">
                  Add note
                </button>
              </form>
            </section>
          </div>

          <div className="ops-stack">
            <section className="panel" aria-labelledby="ops-led">
              <div className="ph">
                <h2 id="ops-led">Ledger</h2>
              </div>
              <div className="ops-ledger-grid">
                <div className="k">
                  <span className="k-label">Spent, all time</span>
                  <b className="v">{money(customer.spentCents)}</b>
                </div>
                <div className="k">
                  <span className="k-label">Orders</span>
                  <b className="v">{customer.orderCount}</b>
                </div>
                <div className="k">
                  <span className="k-label">Average order</span>
                  <b className="v">{money(averageOrderCents(customer))}</b>
                </div>
                <div className="k">
                  <span className="k-label">Returns</span>
                  <b className="v paid">{customer.returns}</b>
                </div>
              </div>
            </section>

            <section className="panel" aria-labelledby="ops-ct">
              <div className="ph">
                <h2 id="ops-ct">Contact</h2>
                <span className="ph-link" style={{ fontSize: 12, fontWeight: 600 }}>
                  Edit
                </span>
              </div>
              <div className="ops-contact-body">
                <span className="mono">{customer.email}</span>
                {addressLines.length > 0 && (
                  <span>
                    {addressLines.map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < addressLines.length - 1 && <br />}
                      </span>
                    ))}
                  </span>
                )}
                <span className="split">
                  <b>Email:</b>{" "}
                  {customer.emailSubscribed ?? "not subscribed"}
                </span>
                <span>
                  <b>Text messages:</b>{" "}
                  {customer.textSubscribed ? "subscribed" : "not subscribed"}
                </span>
              </div>
            </section>

            {customer.waitingFor && (
              <section className="panel" aria-labelledby="ops-wt">
                <div className="ph">
                  <h2 id="ops-wt">Waiting for</h2>
                </div>
                <div className="ops-waiting-body">
                  <span className="wname">
                    <b>{customer.waitingFor.productName}</b>
                    <span className="mono">
                      {customer.waitingFor.sku} · {customer.waitingFor.note}
                    </span>
                  </span>
                  <Stamp tone="tape">Restock alert</Stamp>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
