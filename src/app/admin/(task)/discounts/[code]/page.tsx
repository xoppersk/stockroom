"use client";

/* O-06 — /admin/discounts/[code] (screens/DiscountBuilder.html).
 * FREESHIP75 is canonical. The dark "In plain words" panel and the
 * storefront banner preview recompute live as the form fields change;
 * the cost estimate is fixture-based (about 41 orders · ≈ $460). */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { TaskBar } from "@/components/sr/TaskBar";
import { getDiscount } from "@/lib/api";
import { money, money0 } from "@/lib/format";

type DiscType = "percentage" | "amount" | "freeship";

interface BuilderSeed {
  status: "running" | "scheduled" | "ended";
  type: DiscType;
  pct?: number;
  amountCents?: number;
  minOrder: string;
  rates: string;
  leaveOut: string;
  exclusionsSentence: string;
  starts: string;
  ends: string;
  perCustomer?: string;
  estimate?: { orders: number; avgLabelCents: number; coverCents: number; note?: string };
}

const FREESHIP_SEED: BuilderSeed = {
  status: "scheduled",
  type: "freeship",
  minOrder: "$75.00",
  rates: "Ground only (USPS, UPS Ground)",
  leaveOut: "Wool throw (oversize box), gift cards",
  exclusionsSentence: "Wool throws and gift cards",
  starts: "Thursday, October 15 · 12:00 AM",
  ends: "Sunday, November 1 · 11:59 PM",
  perCustomer: "1",
  estimate: {
    orders: 41,
    avgLabelCents: 1120,
    coverCents: 46000,
    note: "Orders between $60 and $75 grew by a third the last time free shipping ran, so expect more qualifying orders than this.",
  },
};

/** Seed the form from the fixture Discount (lib/types). FREESHIP75 keeps
 *  the screen's full date strings and exclusions copy; the fixture carries
 *  the same facts in short form ("Oct 15", minOrderCents, estimate). */
function seedFromDiscount(
  code: string,
  d: import("@/lib/types").Discount | undefined,
): BuilderSeed {
  if (!d) return code === "FREESHIP75" ? FREESHIP_SEED : {
    status: "running",
    type: "percentage",
    minOrder: "",
    rates: "Ground only (USPS, UPS Ground)",
    leaveOut: "",
    exclusionsSentence: "",
    starts: "",
    ends: "",
  };
  if (d.kind === "free-shipping") {
    return {
      ...FREESHIP_SEED,
      status: d.status,
      minOrder: `$${(d.minOrderCents / 100).toFixed(2)}`,
      estimate: d.estimate
        ? {
            orders: d.estimate.qualifyingOrders,
            avgLabelCents: d.estimate.avgLabelCents,
            coverCents: d.estimate.coverCents,
            note: FREESHIP_SEED.estimate?.note,
          }
        : undefined,
      starts: code === "FREESHIP75" ? FREESHIP_SEED.starts : (d.startsLabel ?? d.whenLabel),
      ends: code === "FREESHIP75" ? FREESHIP_SEED.ends : (d.endsLabel ?? ""),
      perCustomer: d.usesPerCustomer ? String(d.usesPerCustomer) : "",
    };
  }
  return {
    status: d.status,
    type: "percentage",
    pct: d.pct ?? undefined,
    perCustomer: d.usesPerCustomer ? String(d.usesPerCustomer) : "",
    minOrder: d.minOrderCents ? `$${(d.minOrderCents / 100).toFixed(2)}` : "",
    rates: "Ground only (USPS, UPS Ground)",
    leaveOut: "",
    exclusionsSentence: "",
    starts: d.startsLabel ?? d.whenLabel,
    ends: d.endsLabel ?? "",
  };
}

/** "Thursday, October 15 · 12:00 AM" → "October 15" */
function shortDate(raw: string): string {
  const head = (raw.split("·")[0] ?? "").trim();
  const parts = head.split(",");
  return parts.length > 1 ? parts.slice(1).join(",").trim() : head;
}

const MONTH_ABBR: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May",
  June: "Jun", July: "Jul", August: "Aug", September: "Sep", October: "Oct",
  November: "Nov", December: "Dec",
};

/** "Sunday, November 1 · 11:59 PM" → "Nov 1" */
function abbrevDate(raw: string): string {
  const s = shortDate(raw);
  const [month = "", day = ""] = s.split(/\s+/);
  return `${MONTH_ABBR[month] ?? month} ${day}`.trim();
}

function parseMoneyText(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) || raw.trim() === "" ? null : n;
}

function moneyShort(dollars: number): string {
  return Number.isInteger(dollars) ? `$${dollars.toLocaleString("en-US")}` : money(Math.round(dollars * 100));
}

export default function DiscountBuilderPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = decodeURIComponent(rawCode).toUpperCase();
  const router = useRouter();

  const seed = useMemo(
    () => seedFromDiscount(code, getDiscount(code)),
    [code],
  );

  const [type, setType] = useState<DiscType>(seed.type);
  const [pct, setPct] = useState<string>(seed.pct ? String(seed.pct) : "");
  const [minOrder, setMinOrder] = useState(seed.minOrder);
  const [rates, setRates] = useState(seed.rates);
  const [leaveOut, setLeaveOut] = useState(seed.leaveOut);
  const [exclusions, setExclusions] = useState(seed.exclusionsSentence);
  const [who, setWho] = useState<"everyone" | "subscribers">("everyone");
  const [continental, setContinental] = useState(true);
  const [combine, setCombine] = useState(false);
  const [starts, setStarts] = useState(seed.starts);
  const [ends, setEnds] = useState(seed.ends);
  const [totalUses, setTotalUses] = useState("");
  const [perCustomer, setPerCustomer] = useState(seed.perCustomer ?? "");
  const [showBanner, setShowBanner] = useState(true);

  const minDollars = parseMoneyText(minOrder);
  const minLabel = minDollars !== null ? moneyShort(minDollars) : "$0";
  const startShort = shortDate(starts);
  const endShort = shortDate(ends);
  const endAbbrev = abbrevDate(ends);
  const perCustomerChanged = perCustomer !== "";
  const oncePhrase =
    perCustomer === "1"
      ? ", once each"
      : perCustomer.trim() !== ""
        ? `, up to ${perCustomer} times each`
        : "";
  const audience =
    who === "subscribers"
      ? "Email subscribers"
      : continental
        ? "Shoppers in the continental US"
        : "Shoppers";

  const datePhrase =
    startShort !== "" ? (
      <>
        , from <b>{startShort}</b>
        {endShort !== "" && (
          <>
            {" "}
            to <b>{endShort}</b>
          </>
        )}
      </>
    ) : null;

  const plainWords =
    type === "freeship" ? (
      <>
        {audience} get free{rates.startsWith("Ground") ? " Ground" : ""}{" "}
        shipping on orders of <b>{minLabel} or more</b>
        {oncePhrase}
        {datePhrase}.
        {exclusions.trim() !== "" && (
          <>
            {" "}
            {exclusions.trim()} don’t count toward the {minLabel}.
          </>
        )}
      </>
    ) : type === "percentage" ? (
      <>
        {audience} get <b>{pct || "0"}% off</b>
        {minDollars !== null && (
          <>
            {" "}
            on orders of <b>{minLabel} or more</b>
          </>
        )}
        {oncePhrase}
        {datePhrase}.
      </>
    ) : (
      <>
        {audience} get <b>{minLabel} off</b>
        {oncePhrase}
        {datePhrase}.
      </>
    );

  const bannerText =
    type === "freeship"
      ? `Free shipping on orders over ${minLabel} · until ${endAbbrev}`
      : type === "percentage"
        ? `${pct || "0"}% off · until ${endAbbrev}`
        : `${minLabel} off · until ${endAbbrev}`;

  const statusStamp: { tone: StampTone; label: string } =
    seed.status === "scheduled"
      ? { tone: "tape", label: "Scheduled" }
      : seed.status === "ended"
        ? { tone: "muted", label: "Ended" }
        : { tone: "paid", label: "Running" };

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    router.push("/admin/discounts");
  }

  return (
    <>
      <TaskBar
        title="Edit discount"
        closeLabel="Close without saving"
        closeHref="/admin/discounts"
      />
      <div className="sr-page">
      <div className="ops-task-grid">
        <form className="ops-stack" onSubmit={onSave}>
          <div className="ops-task-head spaced">
            <Link className="ops-backlink" href="/admin/discounts">
              ← Discounts
            </Link>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h1 className="ops-code-title mono">{code}</h1>
              <Stamp tone={statusStamp.tone}>{statusStamp.label}</Stamp>
            </div>
          </div>

          <section className="panel" aria-labelledby="ops-db-g">
            <div className="ph">
              <h2 id="ops-db-g">What the customer gets</h2>
            </div>
            <div className="pb">
              <div
                role="radiogroup"
                aria-labelledby="ops-db-g"
                className="ops-opt-grid"
              >
                <label className={`opt${type === "percentage" ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="t"
                    checked={type === "percentage"}
                    onChange={() => setType("percentage")}
                  />
                  <span>
                    <b>Percentage off</b>
                  </span>
                </label>
                <label className={`opt${type === "amount" ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="t"
                    checked={type === "amount"}
                    onChange={() => setType("amount")}
                  />
                  <span>
                    <b>Amount off</b>
                  </span>
                </label>
                <label className={`opt${type === "freeship" ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="t"
                    checked={type === "freeship"}
                    onChange={() => setType("freeship")}
                  />
                  <span>
                    <b>Free shipping</b>
                  </span>
                </label>
              </div>
              {type === "percentage" && (
                <div className="f">
                  <label htmlFor="ops-db-pct">Percentage off</label>
                  <input
                    id="ops-db-pct"
                    className="in"
                    value={pct}
                    onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              )}
              <div className="ops-form-grid2" style={{ gap: 14 }}>
                <div className="f">
                  <label htmlFor="ops-db-mn">
                    {type === "amount" ? "Amount off" : "Minimum order"}
                  </label>
                  <input
                    id="ops-db-mn"
                    className="in"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="ops-db-rt">Shipping rates covered</label>
                  <select
                    id="ops-db-rt"
                    className="in"
                    value={rates}
                    onChange={(e) => setRates(e.target.value)}
                  >
                    <option>Ground only (USPS, UPS Ground)</option>
                    <option>All rates</option>
                  </select>
                </div>
              </div>
              <div className="f">
                <label htmlFor="ops-db-ex">Leave out</label>
                <input
                  id="ops-db-ex"
                  className="in"
                  value={leaveOut}
                  onChange={(e) => {
                    setLeaveOut(e.target.value);
                    setExclusions(
                      e.target.value.replace(/\s*\([^)]*\)/g, "").trim(),
                    );
                  }}
                />
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="ops-db-w">
            <div className="ph">
              <h2 id="ops-db-w">Who can use it</h2>
            </div>
            <div className="pb">
              <label className="ck">
                <input
                  type="radio"
                  name="who"
                  checked={who === "everyone"}
                  onChange={() => setWho("everyone")}
                />
                <span>
                  <b>Everyone</b> with the code, or automatically at checkout
                </span>
              </label>
              <label className="ck">
                <input
                  type="radio"
                  name="who"
                  checked={who === "subscribers"}
                  onChange={() => setWho("subscribers")}
                />
                <span>
                  <b>Email subscribers only</b> · 742 people
                </span>
              </label>
              <label className="ck">
                <input
                  type="checkbox"
                  checked={continental}
                  onChange={(e) => setContinental(e.target.checked)}
                />
                <span>Continental US addresses only</span>
              </label>
              <label className="ck">
                <input
                  type="checkbox"
                  checked={combine}
                  onChange={(e) => setCombine(e.target.checked)}
                />
                <span>Can be combined with WELCOME15</span>
              </label>
            </div>
          </section>

          <section className="panel" aria-labelledby="ops-db-wh">
            <div className="ph">
              <h2 id="ops-db-wh">When and how often</h2>
            </div>
            <div className="pb">
              <div className="ops-form-grid2" style={{ gap: 14 }}>
                <div className="f">
                  <label htmlFor="ops-db-sd">Starts</label>
                  <input
                    id="ops-db-sd"
                    className="in"
                    value={starts}
                    onChange={(e) => setStarts(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="ops-db-ed">Ends</label>
                  <input
                    id="ops-db-ed"
                    className="in"
                    value={ends}
                    onChange={(e) => setEnds(e.target.value)}
                  />
                </div>
              </div>
              <div className="ops-form-grid2" style={{ gap: 14 }}>
                <div className="f">
                  <label htmlFor="ops-db-lt">Total uses</label>
                  <input
                    id="ops-db-lt"
                    className="in"
                    placeholder="No limit"
                    value={totalUses}
                    onChange={(e) => setTotalUses(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="ops-db-pc">Uses per customer</label>
                  <input
                    id="ops-db-pc"
                    className={`in${perCustomerChanged ? " changed" : ""}`}
                    value={perCustomer}
                    onChange={(e) => setPerCustomer(e.target.value)}
                  />
                  {perCustomerChanged && (
                    <span className="changed-note">Changed from no limit</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="ops-form-actions split">
            <button type="button" className="btn lg destructive">
              Delete discount
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/admin/discounts" className="btn lg">
                Cancel
              </Link>
              <button type="submit" className="btn lg tape">
                Save schedule
              </button>
            </div>
          </div>
        </form>

        <aside aria-label="Summary" className="ops-stack">
          <section className="panel ops-panel-dark" aria-labelledby="ops-db-sm">
            <div className="ph">
              <h2 id="ops-db-sm">In plain words</h2>
              <Stamp tone="tape">{statusStamp.label}</Stamp>
            </div>
            <p className="ops-plain-words">{plainWords}</p>
          </section>

          {seed.estimate && (
            <section className="panel" aria-labelledby="ops-db-ct">
              <div className="ph">
                <h2 id="ops-db-ct">What it might cost</h2>
                <span className="ph-note">Based on the last 18 days</span>
              </div>
              <div className="ops-cost-grid">
                <div className="k">
                  <span className="k-label">Orders that would qualify</span>
                  <b className="v">about {seed.estimate.orders}</b>
                </div>
                <div className="k">
                  <span className="k-label">Average Ground label</span>
                  <b className="v">{money(seed.estimate.avgLabelCents)}</b>
                </div>
              </div>
              <div className="ops-cost-body">
                <div className="ops-cost-total">
                  <span style={{ fontWeight: 600 }}>Shipping you’d cover</span>
                  <b>≈ {money0(seed.estimate.coverCents)}</b>
                </div>
                {seed.estimate.note && (
                  <span className="ops-cost-note">{seed.estimate.note}</span>
                )}
              </div>
            </section>
          )}

          <section className="panel" aria-labelledby="ops-db-bn">
            <div className="ph">
              <h2 id="ops-db-bn">Storefront banner</h2>
            </div>
            <div className="ops-banner-body">
              {showBanner && (
                <div className="ops-banner-bar">{bannerText}</div>
              )}
              <label className="ck">
                <input
                  type="checkbox"
                  checked={showBanner}
                  onChange={(e) => setShowBanner(e.target.checked)}
                />
                <span>Show this banner while the discount runs</span>
              </label>
            </div>
          </section>
        </aside>
      </div>
      </div>
    </>
  );
}
