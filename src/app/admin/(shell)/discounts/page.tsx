/* O-05 — /admin/discounts (screens/Discounts.html).
 * Async server component: rows from listConsoleDiscounts() (uses and
 * given-30d derived from discount_redemptions by the mapper), totals
 * from getConsoleDiscountsTotals(). A paused discount keeps the
 * 'ended' row slot but its stamp reads "Paused" (ruling 10). */

import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { CodeTag } from "@/components/sr/CodeTag";
import { Stamp } from "@/components/sr/Stamp";
import {
  getConsoleDiscountsTotals,
  listConsoleDiscounts,
} from "@/lib/shop/admin";
import type { Discount } from "@/lib/types";
import { money0 } from "@/lib/format";

interface RowVm {
  code: string;
  title: string;
  detail?: string;
  whenLabel: string;
  usageLabel: string;
  usagePct: number;
  usageBarPaid: boolean;
  startsInLabel?: string;
  givenCents: number;
  status: Discount["status"];
  paused: boolean;
}

function isPaused(d: Discount): boolean {
  const extra = d as Discount & { paused?: boolean };
  return extra.paused === true || d.endedReasonLabel === "Paused";
}

function rowOf(d: Discount): RowVm {
  const paused = isPaused(d);
  return {
    code: d.code,
    title: d.whatLabel,
    detail:
      d.status === "ended" && d.endedReasonLabel && !paused
        ? d.endedReasonLabel
        : d.whoLabel,
    whenLabel: d.whenLabel,
    usageLabel: d.useLimit
      ? `${d.uses} of ${d.useLimit}`
      : d.wholesale
        ? `${d.uses} orders`
        : `${d.uses} uses · no limit`,
    usagePct: d.useLimit
      ? Math.min(100, Math.round((d.uses / d.useLimit) * 100))
      : 100,
    usageBarPaid: d.status === "running",
    startsInLabel: d.startsInLabel,
    givenCents: d.givenCents30d,
    status: d.status,
    paused,
  };
}

export default async function DiscountsPage() {
  const [list, totals] = await Promise.all([
    listConsoleDiscounts(),
    getConsoleDiscountsTotals(),
  ]);
  const discounts = list.map(rowOf);
  const running = discounts.filter((d) => d.status === "running").length;
  const scheduled = discounts.filter((d) => d.status === "scheduled").length;

  return (
    <>
      <section className="ops-hero flush">
        <div className="ops-hero-grid">
          <div className="ops-hero-lead">
            <h1 className="ops-h1">Discounts</h1>
            <span className="ops-sub">
              {running} running and {scheduled} scheduled. In the last 30 days
              discounts took {money0(totals.givenCents30d)} off{" "}
              {totals.ordersCents30d > 0 ? (
                <>
                  {money0(totals.ordersCents30d)} of orders, an average of{" "}
                  {totals.avgPct}%.
                </>
              ) : (
                <>orders.</>
              )}
            </span>
          </div>
          <div className="ops-stats" aria-hidden="true">
            <div className="ops-stat">
              <div className="sv cond paid">{running}</div>
              <div className="sl">running</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond tape-ink">{scheduled}</div>
              <div className="sl">scheduled</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond">{money0(totals.givenCents30d)}</div>
              <div className="sl">off in 30 days</div>
            </div>
            <div className="ops-stat">
              <div className="sv cond">{totals.avgPct}%</div>
              <div className="sl">average</div>
            </div>
          </div>
          <div>
            <Button variant="tape" href="/admin/discounts/new">
              Create discount
            </Button>
          </div>
        </div>
      </section>

      <div className="sr-page" style={{ paddingTop: 22 }}>
        <div className="ops-stack">
          <section className="panel">
            <div className="ops-scroll">
              <div role="table" aria-label="Discounts">
                <div role="row" className="dr head">
                  <span role="columnheader">Code</span>
                  <span role="columnheader">What it gives</span>
                  <span role="columnheader">When</span>
                  <span role="columnheader">Used</span>
                  <span role="columnheader" style={{ textAlign: "right" }}>
                    Given, 30 d
                  </span>
                  <span role="columnheader">Status</span>
                </div>
                {discounts.map((d) => (
                  <Link
                    role="row"
                    className={`dr${d.status === "scheduled" ? " scheduled" : ""}${d.status === "ended" ? " ended" : ""}`}
                    key={d.code}
                    href={`/admin/discounts/${d.code}`}
                  >
                    <span role="cell">
                      <CodeTag code={d.code} />
                    </span>
                    <span role="cell" className="what">
                      <b>{d.title}</b>
                      {d.detail && <span>{d.detail}</span>}
                    </span>
                    <span role="cell">{d.whenLabel}</span>
                    <span role="cell" className="use">
                      {d.status === "scheduled" ? (
                        <>
                          <span className="starts">{d.startsInLabel}</span>
                          <i className="hatched" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          <span>{d.usageLabel}</span>
                          <i aria-hidden="true">
                            <b
                              className={d.usageBarPaid ? "paid" : ""}
                              style={{ width: `${d.usagePct}%` }}
                            />
                          </i>
                        </>
                      )}
                    </span>
                    <span role="cell" className="given">
                      {d.status === "scheduled" ? (
                        <span className="given none">—</span>
                      ) : d.status === "ended" ? (
                        <span style={{ fontSize: 13, fontWeight: 400 }}>
                          {money0(d.givenCents)}
                        </span>
                      ) : (
                        money0(d.givenCents)
                      )}
                    </span>
                    <span role="cell">
                      {d.paused ? (
                        <Stamp tone="muted">Paused</Stamp>
                      ) : d.status === "running" ? (
                        <Stamp tone="paid">Running</Stamp>
                      ) : d.status === "scheduled" ? (
                        <Stamp tone="tape">Scheduled</Stamp>
                      ) : (
                        <Stamp tone="muted">Ended</Stamp>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            {discounts.length === 0 && (
              <div style={{ padding: "18px 20px" }}>
                <span>No discount codes yet. Create the first one above.</span>
              </div>
            )}
          </section>
          <p className="ops-rule-note">
            Only one code applies per order. Wholesale prices never combine
            with other discounts.
          </p>
        </div>
      </div>
    </>
  );
}
