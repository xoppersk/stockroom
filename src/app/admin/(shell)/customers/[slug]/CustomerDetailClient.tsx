"use client";

/* O-04 island — /admin/customers/[slug] (screens/CustomerDetail.html).
 * Receives the real customer record (getConsoleCustomer: order history,
 * spent and returns derived from real orders; address from
 * customer_addresses) and the last order's real hold, when one exists,
 * from the server page. Notes append through addCustomerNote (dated
 * append onto customers.notes, admin/support write policy) and tags
 * save through updateCustomer — both re-read via router.refresh(). */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { addCustomerNote, updateCustomer } from "@/lib/shop/admin-actions";
import { averageOrderCents } from "@/lib/derive";
import type { Customer } from "@/lib/types";
import { money } from "@/lib/format";

const AVATAR_PALETTE = ["#3A3530", "#57534E", "#1C1917", "#44403C"];

export interface CustomerHoldVm {
  orderId: string;
  stamp: string;
  title: string;
  text: string;
}

function statusTone(label: string): StampTone {
  const l = label.toLowerCase();
  if (l === "stock hold" || l === "on hold" || l === "held") return "tape";
  if (l === "delivered" || l === "shipped") return "paid";
  if (l === "payment failed") return "problem";
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

export default function CustomerDetailClient({
  customer,
  hold,
}: {
  customer: Customer;
  hold: CustomerHoldVm | null;
}) {
  const router = useRouter();
  const slug = customer.slug;
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const [tags, setTags] = useState<string[]>(customer.tags);
  const [tagInput, setTagInput] = useState("");
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagsSaving, setTagsSaving] = useState(false);
  const tagsDirty =
    tags.length !== customer.tags.length ||
    tags.some((t, i) => t !== customer.tags[i]);

  const tag = customer.tags[0];
  const addressLines = customer.address
    ? [
        customer.address.split(", ")[0],
        customer.address.split(", ").slice(1).join(", "),
      ].filter(Boolean)
    : [];

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    const result = await addCustomerNote(slug, text);
    setNoteSaving(false);
    if (!result.ok) {
      setNoteError(result.reason);
      return;
    }
    setNoteText("");
    router.refresh();
  }

  async function saveTags() {
    if (!tagsDirty || tagsSaving) return;
    setTagsSaving(true);
    setTagsError(null);
    const result = await updateCustomer(slug, { tags });
    setTagsSaving(false);
    if (!result.ok) {
      setTagsError(result.reason);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <section className="ops-detail-band">
        <div className="ops-detail-id">
          <span
            className="ops-avatar-lg"
            aria-hidden="true"
            style={{ background: AVATAR_PALETTE[0] }}
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
              {customer.orderHistory.length === 0 && (
                <div style={{ padding: "14px 20px" }}>
                  <span>No orders yet.</span>
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="ops-nt">
              <div className="ph">
                <h2 id="ops-nt">Notes and contact</h2>
              </div>
              <div className="ops-notes-body">
                {customer.notes.map((n, i) => (
                  <div className="ops-note-row" key={`${n.dateLabel}-${i}`}>
                    <span className="when">{n.dateLabel}</span>
                    <span>
                      <NoteText text={n.text} />
                    </span>
                  </div>
                ))}
                {customer.notes.length === 0 && (
                  <div className="ops-note-row">
                    <span>No notes yet.</span>
                  </div>
                )}
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
                <button className="btn" type="submit" disabled={noteSaving}>
                  Add note
                </button>
              </form>
              {noteError && (
                <div style={{ padding: "0 20px 14px" }}>
                  <span className="field-error" role="alert">
                    {noteError}
                  </span>
                </div>
              )}
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
                <span className="split">
                  <b>Tags:</b>{" "}
                  {tags.length > 0 ? tags.join(", ") : "none"}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label className="sr-only" htmlFor="ops-tag-in">
                    Add a tag
                  </label>
                  <input
                    id="ops-tag-in"
                    className="in"
                    style={{ maxWidth: 180 }}
                    placeholder="Add a tag"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = tagInput.trim();
                        if (t && !tags.includes(t)) setTags([...tags, t]);
                        setTagInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const t = tagInput.trim();
                      if (t && !tags.includes(t)) setTags([...tags, t]);
                      setTagInput("");
                    }}
                  >
                    Add tag
                  </button>
                  {tags.length > 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setTags(tags.slice(0, -1))}
                    >
                      Remove last tag
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn tape"
                    disabled={!tagsDirty || tagsSaving}
                    onClick={saveTags}
                  >
                    Save tags
                  </button>
                </div>
                {tagsDirty && (
                  <span className="field-note">Tags changed · not saved</span>
                )}
                {tagsError && (
                  <span className="field-error" role="alert">
                    {tagsError}
                  </span>
                )}
              </div>
            </section>

            {customer.wholesale?.code && (
              <section className="panel" aria-labelledby="ops-ws">
                <div className="ph">
                  <h2 id="ops-ws">Wholesale</h2>
                  <Stamp tone="ink">Wholesale</Stamp>
                </div>
                <div className="ops-waiting-body">
                  <span className="wname">
                    <b>{customer.wholesale.discountPct}% wholesale</b>
                    <span className="mono">
                      {customer.wholesale.code}
                      {customer.wholesale.termsLabel
                        ? ` · ${customer.wholesale.termsLabel}`
                        : ""}
                    </span>
                  </span>
                </div>
              </section>
            )}

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
