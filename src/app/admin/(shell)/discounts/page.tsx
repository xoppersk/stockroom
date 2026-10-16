/* O-05 — /admin/discounts (screens/Discounts.html).
 * Totals come from discountsTotals(): $1,126 off $9,840 of orders in the
 * last 30 days, an average of 11.4%. Rows come from listDiscounts(). */

import Link from "next/link";
import { Button } from "@/components/sr/Button";
import { CodeTag } from "@/components/sr/CodeTag";
import { Stamp } from "@/components/sr/Stamp";
import { discountsTotals, listDiscounts } from "@/lib/api";
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
}

function rowOf(d: Discount): RowVm {
  return {
    code: d.code,
    title: d.whatLabel,
    detail:
      d.status === "ended" && d.endedReasonLabel
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
  };
}

export default function DiscountsPage() {
  const discounts = listDiscounts().map(rowOf);
  const totals = discountsTotals();
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
              {money0(totals.ordersCents30d)} of orders, an average of{" "}
              {totals.avgPct}%.
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
            <Button variant="tape" href="/admin/discounts/FREESHIP75">
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
                      {d.status === "running" ? (
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
