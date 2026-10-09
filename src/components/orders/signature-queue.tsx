"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUEUE_STATUSES, SIGNATURE_QUEUE, type SignatureOrder } from "@/lib/truth-ledger";

function money2(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Amber underline style for review/cancelled rows (Flagship UI Designs). */
function statusClass(status: string): string {
  return /review|cancelled/.test(status.toLowerCase()) ? "low" : "";
}

function toCsv(rows: SignatureOrder[]): string {
  const header = ["order_number", "customer", "items", "status", "total"];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.orderNumber, r.customer, r.items, r.status, r.total].map(esc).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

const CUTOFF_NOTES: Array<[string, string]> = [
  ["ORD-1048", "Verify tote allocation before picking"],
  ["#1044", "Gift note must be enclosed"],
  ["#1047", "Carrier scan expected by 11:00 AM"],
];

/**
 * Signature fulfillment queue (Flagship UI Designs, stockroom Orders).
 * The eight canonical orders; the status filter narrows the visible rows
 * and re-totals the summary, exactly like the artifact prototype.
 */
export function SignatureQueue() {
  const [status, setStatus] = useState<string>("All orders");

  const visible = useMemo(
    () =>
      status === "All orders"
        ? SIGNATURE_QUEUE
        : SIGNATURE_QUEUE.filter((o) => o.status === status),
    [status],
  );
  const visibleTotal = visible.reduce((s, o) => s + o.totalCents, 0);

  function exportQueue() {
    const blob = new Blob([toCsv([...visible])], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stockroom-order-queue-2026-10-06.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Ops toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label
          htmlFor="orderStatusFilter"
          className="text-[8px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          Status
        </label>
        <select
          id="orderStatusFilter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-9 border border-border bg-card px-2.5 py-1 text-[12px] text-foreground"
        >
          {QUEUE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={exportQueue}>
          <Download className="size-4" aria-hidden />
          Export queue
        </Button>
        <span className="tnum ml-auto font-mono text-[11px] text-muted-foreground">
          {visible.length} order{visible.length === 1 ? "" : "s"} · {money2(visibleTotal)}
        </span>
      </div>

      {/* Queue table */}
      <section aria-label="Order queue" className="border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="text-left font-medium text-muted-foreground">
                <th className="border-b border-border px-1.5 py-2 font-medium">Order</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">Customer</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">Items</th>
                <th className="border-b border-border px-1.5 py-2 font-medium">Status</th>
                <th className="border-b border-border px-1.5 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr
                  key={o.orderNumber}
                  className="h-[56px] border-b border-dashed border-border last:border-0"
                >
                  <td className="tnum whitespace-nowrap px-1.5 py-2.5 font-mono">{o.orderNumber}</td>
                  <td className="whitespace-nowrap px-1.5 py-2.5 font-semibold">{o.customer}</td>
                  <td className="tnum whitespace-nowrap px-1.5 py-2.5 font-mono">
                    {o.items} item{o.items === 1 ? "" : "s"}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2.5">
                    <span
                      className={cn(
                        "inline-block border-b-2 pb-0.5 font-display text-[8px] font-semibold uppercase tracking-[0.08em]",
                        statusClass(o.status) === "low"
                          ? "border-[#d97706] text-[#a95412]"
                          : "border-[#8a857c] text-[#5d5a53]",
                      )}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="tnum whitespace-nowrap px-1.5 py-2.5 text-right font-mono text-[10px] font-medium">
                    {o.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Queue notes */}
      <div className="mt-8 mb-3 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2">
        <h2 className="text-[13px] font-semibold">Queue notes</h2>
        <span className="tnum font-mono text-[8px] text-muted-foreground">
          Last reconciled October 6, 2026 · 8:32 AM
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="Fulfillment cut-off" className="border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold">Fulfillment cut-off</h3>
          <p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">
            Orders marked ready by 2:00 PM ship today.
          </p>
          <div className="mt-2">
            {CUTOFF_NOTES.map(([order, note]) => (
              <div
                key={order}
                className="grid grid-cols-[24px_1fr_auto] items-start gap-2.5 border-b border-border py-2.5 text-[9px] last:border-0"
              >
                <span
                  aria-hidden
                  className="grid size-[22px] place-items-center border border-border font-mono text-[8px] text-primary"
                >
                  →
                </span>
                <span>
                  <b className="tnum block font-mono text-[9px]">{order}</b>
                  <small className="text-[8px] text-muted-foreground">{note}</small>
                </span>
                <time className="tnum text-[8px] text-muted-foreground">October 6</time>
              </div>
            ))}
          </div>
        </section>

        <aside aria-label="Exception ownership" className="border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold">Exception ownership</h3>
          <p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">
            Every held order has a named next action.
          </p>
          <div className="mt-2">
            <div className="grid grid-cols-[24px_1fr_auto] items-start gap-2.5 border-b border-border py-2.5 text-[9px]">
              <span
                aria-hidden
                className="grid size-[22px] place-items-center bg-[#efe2cf] font-mono text-[8px] font-medium text-[#8d4315]"
              >
                SK
              </span>
              <span>
                <b className="block text-[9px]">Payment review</b>
                <small className="text-[8px] text-muted-foreground">Jordan Bell · order #1046</small>
              </span>
              <time className="tnum text-[8px] text-muted-foreground">Due 10:30 AM</time>
            </div>
            <div className="grid grid-cols-[24px_1fr_auto] items-start gap-2.5 py-2.5 text-[9px]">
              <span
                aria-hidden
                className="grid size-[22px] place-items-center bg-[#efe2cf] font-mono text-[8px] font-medium text-[#8d4315]"
              >
                MJ
              </span>
              <span>
                <b className="block text-[9px]">Stock verification</b>
                <small className="text-[8px] text-muted-foreground">
                  Avery Lewis · ORD-1048 · 2 items · $128.00
                </small>
              </span>
              <time className="tnum text-[8px] text-muted-foreground">Due 11:00 AM</time>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
