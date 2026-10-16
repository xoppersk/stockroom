"use client";

/* O-03 — /admin/customers (screens/Customers.html).
 * Totals come from customersTotals() (1,206 customers · 214 returning ·
 * 9 waiting on restock); rows from listCustomers(). Segment, search and
 * sort all live in the URL query (§10). Sub-lines the screen draws are
 * derived from the record: wholesale terms, restock wait, address hold,
 * first order, else "Customer since …". */

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { customersTotals, getOrder, listCustomers } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { money, num } from "@/lib/format";

interface RowVm {
  slug: string;
  name: string;
  initials: string;
  avatarBg: string;
  sub: string;
  lastOrderId?: string;
  lastOrderWhen?: string;
  lastOrderStatus?: string;
  lastOrderTone?: "tape" | "problem";
  orders: number;
  spentCents: number;
  where?: string;
  tagLabel?: string;
  tagTone?: StampTone;
  tagDashed?: boolean;
  segments: string[];
  email?: string;
}

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
const AVATAR_PALETTE = ["#3A3530", "#57534E", "#1C1917", "#44403C"];

const OPEN_STATUSES = new Set([
  "on hold",
  "payment failed",
  "label created",
  "packing",
  "to pick",
  "held",
  "paid and reserved",
]);

function subOf(c: Customer): string {
  if (c.wholesale)
    return `${c.wholesale.termsLabel} · ${c.wholesale.discountPct}% wholesale`;
  // Customers.html: Avery (email subscriber) draws "Customer since March ·
  // email subscriber" despite waitingFor; Imogen (no subscription) draws the
  // waiting line — so waiting only wins when there is no subscription to state.
  if (c.waitingFor && !c.emailSubscribed)
    return `Waiting on ${c.waitingFor.productName}`;
  const last = c.lastOrder ? getOrder(c.lastOrder.orderId) : undefined;
  if (last?.hold?.kind === "address") return "Address needs checking";
  if (c.tags.includes("New") && c.orderCount <= 1) return "First order";
  return `Customer since ${c.sinceLabel}${c.emailSubscribed ? " · email subscriber" : ""}`;
}

function segmentsOf(c: Customer): string[] {
  const segs: string[] = [];
  if (c.tags.includes("Returning")) segs.push("returning");
  if (c.type === "wholesale" || c.tags.includes("Wholesale"))
    segs.push("wholesale");
  if (c.waitingFor || c.tags.includes("Restock alert")) segs.push("restock");
  if (c.lastOrder && OPEN_STATUSES.has(c.lastOrder.statusLabel))
    segs.push("open");
  return segs;
}

function rowOf(c: Customer, i: number): RowVm {
  const tag = c.tags[0];
  const status = c.lastOrder?.statusLabel;
  return {
    slug: c.slug,
    name: c.name,
    initials: c.initials,
    avatarBg:
      AVATAR_FALLBACK[c.slug] ??
      AVATAR_PALETTE[i % AVATAR_PALETTE.length] ??
      "#57534E",
    sub: subOf(c),
    lastOrderId: c.lastOrder?.orderId,
    lastOrderWhen: c.lastOrder?.dateLabel,
    lastOrderStatus: status,
    lastOrderTone:
      status === "payment failed"
        ? "problem"
        : status === "on hold" || status === "held"
          ? "tape"
          : undefined,
    orders: c.orderCount,
    spentCents: c.spentCents,
    where: c.location,
    tagLabel: tag,
    tagTone:
      tag === "Restock alert" ? "tape" : tag === "New" ? "muted" : "ink",
    tagDashed: tag === "New",
    segments: segmentsOf(c),
    email: c.email,
  };
}

const FALLBACK_ROWS: RowVm[] = [
  { slug: "avery-lewis", name: "Avery Lewis", initials: "AL", avatarBg: "#3A3530", sub: "Customer since March · email subscriber", lastOrderId: "ORD-1048", lastOrderWhen: "today", lastOrderStatus: "on hold", lastOrderTone: "tape", orders: 6, spentCents: 61400, where: "Philadelphia, PA", tagLabel: "Returning", tagTone: "ink", segments: ["returning", "open"] },
  { slug: "jordan-bell", name: "Jordan Bell", initials: "JB", avatarBg: "#57534E", sub: "First order", lastOrderId: "ORD-1046", lastOrderWhen: "today", lastOrderStatus: "payment failed", lastOrderTone: "problem", orders: 1, spentCents: 0, where: "Pittsburgh, PA", tagLabel: "New", tagTone: "muted", tagDashed: true, segments: ["open"] },
  { slug: "kettle-crumb-cafe", name: "Kettle & Crumb Café", initials: "KC", avatarBg: "#1C1917", sub: "Net 30 · 25% wholesale", lastOrderId: "ORD-1039", lastOrderWhen: "Oct 3", lastOrderStatus: "shipped", orders: 14, spentCents: 392000, where: "Philadelphia, PA", tagLabel: "Wholesale", tagTone: "ink", segments: ["wholesale"] },
  { slug: "morgan-reed", name: "Morgan Reed", initials: "MR", avatarBg: "#44403C", sub: "Customer since June", lastOrderId: "ORD-1047", lastOrderWhen: "today", lastOrderStatus: "label created", orders: 3, spentCents: 28800, where: "Camden, NJ", tagLabel: "Returning", tagTone: "ink", segments: ["returning", "open"] },
  { slug: "theo-grant", name: "Theo Grant", initials: "TG", avatarBg: "#57534E", sub: "Customer since August", lastOrderId: "ORD-1044", lastOrderWhen: "yesterday", lastOrderStatus: "packing", orders: 2, spentCents: 24100, where: "Brooklyn, NY", tagLabel: "Returning", tagTone: "ink", segments: ["returning", "open"] },
  { slug: "imogen-shaw", name: "Imogen Shaw", initials: "IS", avatarBg: "#A15C00", sub: "Waiting on Wool throw — Rust", lastOrderId: "ORD-1051", lastOrderWhen: "today", lastOrderStatus: "to pick", orders: 1, spentCents: 14800, where: "Baltimore, MD", tagLabel: "Restock alert", tagTone: "tape", segments: ["restock", "open"] },
  { slug: "hana-mori", name: "Hana Mori", initials: "HM", avatarBg: "#44403C", sub: "Customer since May", lastOrderId: "ORD-1045", lastOrderWhen: "today", lastOrderStatus: "packing", orders: 4, spentCents: 19600, where: "Philadelphia, PA", tagLabel: "Returning", tagTone: "ink", segments: ["returning", "open"] },
  { slug: "lucia-ferreira", name: "Lucia Ferreira", initials: "LF", avatarBg: "#57534E", sub: "Address needs checking", lastOrderId: "ORD-1043", lastOrderWhen: "yesterday", lastOrderStatus: "held", lastOrderTone: "tape", orders: 1, spentCents: 9600, where: "Newark, DE", tagLabel: "New", tagTone: "muted", tagDashed: true, segments: ["open"] },
];

type Segment = "all" | "returning" | "open" | "restock" | "wholesale";

function CustomersInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const segment = (params.get("segment") as Segment | null) ?? "all";
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "last";
  const shown = Math.max(8, Number(params.get("n") ?? 8) || 8);

  const totals = useMemo(() => customersTotals(), []);
  const customers = useMemo(() => {
    const list = listCustomers();
    return list.length > 0 ? list.map(rowOf) : FALLBACK_ROWS;
  }, []);

  const filtered = useMemo(() => {
    let rows = customers;
    if (segment !== "all")
      rows = rows.filter((c) => c.segments.includes(segment));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((c) =>
        [c.name, c.sub, c.email, c.lastOrderId, c.where]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
    }
    if (sort === "spend")
      rows = [...rows].sort((a, b) => b.spentCents - a.spentCents);
    else if (sort === "name")
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [customers, segment, q, sort]);

  const visible = filtered.slice(0, shown);

  function setQuery(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) query.delete(k);
      else query.set(k, v);
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  function exportCsv() {
    const head = "Name,Last order,Orders,Spent,Where,Tag\n";
    const body = filtered
      .map((c) =>
        [
          `"${c.name.replace(/"/g, '""')}"`,
          c.lastOrderId ?? "",
          c.orders,
          money(c.spentCents),
          `"${c.where ?? ""}"`,
          c.tagLabel ?? "",
        ].join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([head + body], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { key: Segment; label: string; count: number; chip: string }[] = [
    { key: "all", label: "All", count: totals.total, chip: "ink" },
    { key: "returning", label: "Returning", count: totals.returning, chip: "flat" },
    { key: "open", label: "Open order", count: totals.openOrders, chip: "flat" },
    { key: "restock", label: "Waiting on restock", count: totals.waitingOnRestock, chip: "tape" },
    { key: "wholesale", label: "Wholesale", count: totals.wholesale, chip: "flat" },
  ];

  return (
    <>
      <section className="ops-hero">
        <div className="ops-hero-grid">
          <div className="ops-hero-lead">
            <h1 className="ops-h1">Customers</h1>
            <span className="ops-sub">
              {num(totals.total)} customers. {totals.returning} came back in
              the last 90 days, and {totals.waitingOnRestock} are waiting for
              something to be restocked.
            </span>
          </div>
          <div className="ops-stats" aria-hidden="true">
            <div className="ops-stat">
              <div className="sv cond">{num(totals.total)}</div>
              <div className="sl">customers</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond">{totals.returning}</div>
              <div className="sl">came back in 90 days</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond tape-ink">{totals.waitingOnRestock}</div>
              <div className="sl">waiting on restock</div>
            </div>
          </div>
          <div className="ops-hero-actions row">
            <button type="button" className="btn" onClick={exportCsv}>
              Export
            </button>
            <button type="button" className="btn tape">
              Add customer
            </button>
          </div>
        </div>
        <div className="ops-tabs" role="tablist" aria-label="Customer views">
          {tabs.map((t) => (
            <button
              key={t.key}
              className="flt"
              role="tab"
              aria-selected={segment === t.key}
              onClick={() => setQuery({ segment: t.key === "all" ? null : t.key, n: null })}
            >
              {t.label}{" "}
              <span className={`cnt ${t.chip}`}>{num(t.count)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="sr-page" style={{ paddingTop: 22 }}>
        <div className="ops-stack" style={{ gap: 14 }}>
          <div className="ops-filterrow">
            <label className="sr-only" htmlFor="ops-cf">
              Find a customer
            </label>
            <input
              id="ops-cf"
              className="ops-search-input"
              type="search"
              placeholder="Name, email, phone or order number"
              value={q}
              onChange={(e) =>
                setQuery({ q: e.target.value === "" ? null : e.target.value })
              }
            />
            <label className="ops-sort" htmlFor="ops-so">
              Sort{" "}
              <select
                id="ops-so"
                value={sort}
                onChange={(e) =>
                  setQuery({ sort: e.target.value === "last" ? null : e.target.value })
                }
              >
                <option value="last">Last order</option>
                <option value="spend">Lifetime spend</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          <section className="panel">
            <div className="ops-scroll">
              <div role="table" aria-label="Customers">
                <div role="row" className="cr head">
                  <span role="columnheader">Customer</span>
                  <span role="columnheader">Last order</span>
                  <span role="columnheader" className="n">
                    Orders
                  </span>
                  <span role="columnheader" className="n">
                    Spent
                  </span>
                  <span role="columnheader">Where</span>
                  <span role="columnheader">Tag</span>
                </div>
                {visible.map((c) => (
                  <Link
                    role="row"
                    className="cr"
                    key={c.slug}
                    href={`/admin/customers/${c.slug}`}
                  >
                    <span role="cell" className="ops-cust-cell">
                      <span
                        className="ops-avatar"
                        aria-hidden="true"
                        style={{ background: c.avatarBg }}
                      >
                        {c.initials}
                      </span>
                      <span className="ops-cust-name">
                        <b>{c.name}</b>
                        <span>{c.sub}</span>
                      </span>
                    </span>
                    <span role="cell" className="last-order">
                      <span className="mono">{c.lastOrderId}</span> ·{" "}
                      {c.lastOrderWhen} ·{" "}
                      {c.lastOrderTone ? (
                        <b
                          className={
                            c.lastOrderTone === "problem" ? "failed" : "hold"
                          }
                        >
                          {c.lastOrderStatus}
                        </b>
                      ) : (
                        c.lastOrderStatus
                      )}
                    </span>
                    <span role="cell" className="n">
                      {c.orders}
                    </span>
                    <span
                      role="cell"
                      className={`n spent cond${c.spentCents === 0 ? " zero" : ""}`}
                    >
                      {money(c.spentCents)}
                    </span>
                    <span role="cell">{c.where}</span>
                    <span role="cell">
                      {c.tagLabel && (
                        <Stamp tone={c.tagTone ?? "ink"} dashed={c.tagDashed}>
                          {c.tagLabel}
                        </Stamp>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="pf">
              <span>
                Showing {visible.length} of {num(totals.total)} · spent = paid
                orders minus refunds
              </span>
              {filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setQuery({ n: String(shown + 8) })}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "var(--ink)",
                  }}
                >
                  Next page
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersInner />
    </Suspense>
  );
}
