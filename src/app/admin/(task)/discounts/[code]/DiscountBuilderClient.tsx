"use client";

/* O-06 island — /admin/discounts/[code] (screens/DiscountBuilder.html).
 * Seeded from the real discount (getConsoleDiscount) or, when the code
 * is unknown / "new", a blank creation form — the [code] segment is
 * the code being created. Only the two DB kinds exist (percentage /
 * fixed amount, ruling 10): free shipping has no DB representation.
 * Save goes through createDiscount / updateDiscount; Pause / Resume
 * through setDiscountStatus. Server-action rejections (RLS: discounts
 * are admin-write; support may only insert one-time apology codes)
 * surface in the form instead of pretending to save. The dark
 * "In plain words" panel recomputes live from the real fields. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stamp, type StampTone } from "@/components/sr/Stamp";
import { TaskBar } from "@/components/sr/TaskBar";
import {
  createDiscount,
  setDiscountStatus,
  updateDiscount,
} from "@/lib/shop/admin-actions";
import type { Discount } from "@/lib/types";
import { money } from "@/lib/format";

type DiscType = "percentage" | "amount";

/** Additive fields the view shape does not carry; read when the mapper
 *  provides them (same pattern as Order.uuid). */
type DiscountExtras = {
  id?: string;
  uuid?: string;
  valueCents?: number;
  startsAt?: string;
  endsAt?: string;
  paused?: boolean;
};

function extrasOf(d: Discount | null): DiscountExtras {
  return (d ?? {}) as Discount & DiscountExtras;
}

function parseMoneyText(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) || raw.trim() === "" ? null : n;
}

function moneyShort(dollars: number): string {
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : money(Math.round(dollars * 100));
}

function fixedValueDollars(d: Discount | null): string {
  const ex = extrasOf(d);
  if (typeof ex.valueCents === "number") return (ex.valueCents / 100).toFixed(2);
  const m = d?.whatLabel.match(/\$([\d,]+(?:\.\d{1,2})?)/);
  return m ? m[1]!.replace(/,/g, "") : "";
}

function toLocalInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 16) : "";
}

export default function DiscountBuilderClient({
  initialCode,
  discount,
  isNew,
  actorRole,
}: {
  initialCode: string;
  discount: Discount | null;
  isNew: boolean;
  actorRole: string;
}) {
  const router = useRouter();
  const ex = extrasOf(discount);
  const paused =
    ex.paused === true || discount?.endedReasonLabel === "Paused";
  const dbId = ex.id ?? ex.uuid ?? discount?.code ?? initialCode;

  const [code, setCode] = useState(initialCode);
  const [type, setType] = useState<DiscType>(
    discount?.kind === "fixed-amount" ? "amount" : "percentage",
  );
  const [pct, setPct] = useState<string>(
    discount?.pct ? String(discount.pct) : "",
  );
  const [amount, setAmount] = useState<string>(fixedValueDollars(discount));
  const [minOrder, setMinOrder] = useState(
    discount && discount.minOrderCents > 0
      ? `$${(discount.minOrderCents / 100).toFixed(2)}`
      : "",
  );
  const [starts, setStarts] = useState(toLocalInput(ex.startsAt));
  const [ends, setEnds] = useState(toLocalInput(ex.endsAt));
  const [totalUses, setTotalUses] = useState(
    discount?.useLimit ? String(discount.useLimit) : "",
  );
  const [perCustomer, setPerCustomer] = useState(
    discount?.usesPerCustomer ? String(discount.usesPerCustomer) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const minDollars = parseMoneyText(minOrder);
  const minLabel = minDollars !== null ? moneyShort(minDollars) : "$0";
  const amountDollars = parseMoneyText(amount);
  const startShort = starts
    ? new Date(starts).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "";
  const endShort = ends
    ? new Date(ends).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "";
  const oncePhrase =
    perCustomer === "1"
      ? ", once each"
      : perCustomer.trim() !== ""
        ? `, up to ${perCustomer} times each`
        : "";

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
    type === "percentage" ? (
      <>
        Shoppers get <b>{pct || "0"}% off</b>
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
        Shoppers get <b>{amountDollars !== null ? moneyShort(amountDollars) : "$0"} off</b>
        {minDollars !== null && (
          <>
            {" "}
            on orders of <b>{minLabel} or more</b>
          </>
        )}
        {oncePhrase}
        {datePhrase}.
      </>
    );

  const statusStamp: { tone: StampTone; label: string } = isNew
    ? { tone: "tape", label: "New" }
    : paused
      ? { tone: "muted", label: "Paused" }
      : discount?.status === "scheduled"
        ? { tone: "tape", label: "Scheduled" }
        : discount?.status === "ended"
          ? { tone: "muted", label: "Ended" }
          : { tone: "paid", label: "Running" };

  const canToggleStatus =
    !isNew && (paused || discount?.status === "running" || discount?.status === "scheduled");

  function buildPayload() {
    const value =
      type === "percentage" ? Number(pct || 0) : (amountDollars ?? 0);
    const payload: Record<string, unknown> = {
      kind: type === "percentage" ? "percentage" : "fixed",
      value,
      usage_limit: totalUses.trim() === "" ? null : Number(totalUses),
      per_customer_limit:
        perCustomer.trim() === "" ? null : Number(perCustomer),
      /* The landed actions read minOrderCents (cents → DB dollars). */
      minOrderCents: Math.round((minDollars ?? 0) * 100),
    };
    /* The view model carries no ISO timestamps, so an untouched date
       field means "leave as-is" on edit (omit the key — never null out
       starts_at) and "DB default / open-ended" on create. */
    if (starts) payload.starts_at = new Date(starts).toISOString();
    if (ends) payload.ends_at = new Date(ends).toISOString();
    else if (isNew) payload.ends_at = null;
    return payload;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    const payload = buildPayload();
    const valueNum =
      type === "percentage" ? Number(pct || 0) : (amountDollars ?? 0);
    if (valueNum <= 0) {
      setError(
        type === "percentage"
          ? "Enter a percentage above zero."
          : "Enter an amount above zero.",
      );
      return;
    }
    if (isNew && code.trim() === "") {
      setError("Enter a discount code.");
      return;
    }
    setSaving(true);
    const result = isNew
      ? await createDiscount({ code: code.trim().toUpperCase(), ...payload, status: "active" })
      : await updateDiscount(dbId, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.push("/admin/discounts");
    router.refresh();
  }

  async function onToggleStatus() {
    if (statusBusy || isNew) return;
    setStatusBusy(true);
    setError(null);
    const result = await setDiscountStatus(dbId, paused ? "active" : "paused");
    setStatusBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <TaskBar
        title={isNew ? "Create discount" : "Edit discount"}
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
                {isNew ? (
                  <>
                    <label className="sr-only" htmlFor="ops-db-code">
                      Discount code
                    </label>
                    <input
                      id="ops-db-code"
                      className="in mono"
                      style={{ fontSize: 22, fontWeight: 700, maxWidth: 280, textTransform: "uppercase" }}
                      placeholder="CODE"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                  </>
                ) : (
                  <h1 className="ops-code-title mono">{discount?.code ?? initialCode}</h1>
                )}
                <Stamp tone={statusStamp.tone}>{statusStamp.label}</Stamp>
              </div>
            </div>

            {actorRole === "support" && (
              <p className="ops-rule-note">
                You’re signed in as Customer service: you can create a
                one-time apology code (percentage, one use, one per
                customer). Editing existing codes is Owner-only — the
                database will reject other saves.
              </p>
            )}
            {error && (
              <p className="ops-rule-note" role="alert" style={{ color: "var(--problem, #b3261e)" }}>
                {error}
              </p>
            )}

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
                </div>
                {type === "percentage" ? (
                  <div className="f">
                    <label htmlFor="ops-db-pct">Percentage off</label>
                    <input
                      id="ops-db-pct"
                      className="in"
                      value={pct}
                      onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                ) : (
                  <div className="f">
                    <label htmlFor="ops-db-amt">Amount off</label>
                    <input
                      id="ops-db-amt"
                      className="in"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                )}
                <div className="f">
                  <label htmlFor="ops-db-mn">Minimum order</label>
                  <input
                    id="ops-db-mn"
                    className="in"
                    placeholder="$0.00"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="panel" aria-labelledby="ops-db-wh">
              <div className="ph">
                <h2 id="ops-db-wh">When and how often</h2>
                {discount?.whenLabel && starts === "" && ends === "" ? (
                  <span className="ph-note">Currently: {discount.whenLabel}</span>
                ) : null}
              </div>
              <div className="pb">
                <div className="ops-form-grid2" style={{ gap: 14 }}>
                  <div className="f">
                    <label htmlFor="ops-db-sd">Starts</label>
                    <input
                      id="ops-db-sd"
                      type="datetime-local"
                      className="in"
                      value={starts}
                      onChange={(e) => setStarts(e.target.value)}
                    />
                  </div>
                  <div className="f">
                    <label htmlFor="ops-db-ed">Ends</label>
                    <input
                      id="ops-db-ed"
                      type="datetime-local"
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
                      onChange={(e) => setTotalUses(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                  <div className="f">
                    <label htmlFor="ops-db-pc">Uses per customer</label>
                    <input
                      id="ops-db-pc"
                      className="in"
                      value={perCustomer}
                      onChange={(e) => setPerCustomer(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="ops-form-actions split">
              <div>
                {canToggleStatus && (
                  <button
                    type="button"
                    className="btn lg"
                    onClick={onToggleStatus}
                    disabled={statusBusy}
                  >
                    {paused ? "Resume discount" : "Pause discount"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/admin/discounts" className="btn lg">
                  Cancel
                </Link>
                <button type="submit" className="btn lg tape" disabled={saving}>
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
          </aside>
        </div>
      </div>
    </>
  );
}
