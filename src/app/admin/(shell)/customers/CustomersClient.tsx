"use client";

/* O-03 island — /admin/customers interactive table.
 * Receives the real customer list + derived totals from the server
 * page (listConsoleCustomers + consoleCustomersTotals). Segment,
 * search and sort live in the URL query (§10). Sub-lines are derived
 * from the record: wholesale terms, restock wait, first order, else
 * "Customer since …". */

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import type { Customer, CustomersTotals } from "@/lib/types";
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

const AVATAR_PALETTE = ["#3A3530", "#57534E", "#1C1917", "#44403C"];

/* Last-order status labels (as mapped from real order statuses) that
 * mean the order is still open. Anything else mapped (delivered,
 * shipped, refunded, cancelled, fulfilled) is closed. */
const OPEN_STATUSES = new Set([
  "on hold",
  "payment failed",
  "payment pending",
  "stock hold",
  "label created",
  "packing",
  "to pick",
  "held",
  "paid and reserved",
  "paid",
  "pending",
  "ready",
]);

function subOf(c: Customer): string {
  if (c.wholesale)
    return `${c.wholesale.termsLabel} · ${c.wholesale.discountPct}% wholesale`;
  // Customers.html: an email subscriber draws "Customer since March ·
  // email subscriber" despite waitingFor; a non-subscriber waiting on a
  // restock draws the waiting line — waiting only wins when there is no
  // subscription to state.
  if (c.waitingFor && !c.emailSubscribed)
    return `Waiting on ${c.waitingFor.productName}`;
  if (c.tags.includes("New") && c.orderCount <= 1) return "First order";
  return `Customer since ${c.sinceLabel}${c.emailSubscribed ? " · email subscriber" : ""}`;
}

function segmentsOf(c: Customer): string[] {
  const segs: string[] = [];
  if (c.tags.includes("Returning")) segs.push("returning");
  if (c.type === "wholesale" || c.tags.includes("Wholesale") || c.tags.includes("wholesale"))
    segs.push("wholesale");
  if (c.waitingFor || c.tags.includes("Restock alert")) segs.push("restock");
  if (c.lastOrder && OPEN_STATUSES.has(c.lastOrder.statusLabel.toLowerCase()))
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
    avatarBg: AVATAR_PALETTE[i % AVATAR_PALETTE.length] ?? "#57534E",
    sub: subOf(c),
    lastOrderId: c.lastOrder?.orderId,
    lastOrderWhen: c.lastOrder?.dateLabel,
    lastOrderStatus: status,
    lastOrderTone:
      status?.toLowerCase() === "payment failed"
        ? "problem"
        : status?.toLowerCase() === "on hold" ||
            status?.toLowerCase() === "held" ||
            status?.toLowerCase() === "stock hold" ||
            status?.toLowerCase() === "payment pending"
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

type Segment = "all" | "returning" | "open" | "restock" | "wholesale";

function CustomersInner({
  customers: serverCustomers,
  totals,
}: {
  customers: Customer[];
  totals: CustomersTotals;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const segment = (params.get("segment") as Segment | null) ?? "all";
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "last";
  const shown = Math.max(8, Number(params.get("n") ?? 8) || 8);

  const customers = useMemo(() => serverCustomers.map(rowOf), [serverCustomers]);

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
            {/* No create-customer action exists in the data layer —
                customers are created by orders and checkout, so this
                drawn button is disabled rather than pretending. */}
            <button type="button" className="btn tape" disabled title="Customers are added when they order — there is no manual add yet">
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
            {visible.length === 0 && (
              <div style={{ padding: "18px 20px" }}>
                <span>
                  {customers.length === 0
                    ? "No customers yet. Customers appear here when an order is placed for them."
                    : "No customers match those filters."}
                </span>
              </div>
            )}
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

export default function CustomersClient({
  customers,
  totals,
}: {
  customers: Customer[];
  totals: CustomersTotals;
}) {
  return (
    <Suspense fallback={null}>
      <CustomersInner customers={customers} totals={totals} />
    </Suspense>
  );
}
