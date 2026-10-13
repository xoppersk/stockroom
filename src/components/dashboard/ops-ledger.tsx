import Link from "next/link";

import { cn } from "@/lib/utils";

export interface OpsLedgerLine {
  label: string;
  value: string;
  note: string;
  href: string;
  /** Exception lines render in tape-amber with a "! " marker. */
  exception?: boolean;
}

/**
 * Operations ledger — the Signature UI hero section (Flagship UI Designs,
 * stockroomProto). Exceptions lead: held orders and low-stock SKUs render in
 * amber above the revenue facts. Each line is a deep link into the work queue.
 *
 * Layout mirrors the artifact: label · dotted leader · mono value · note in
 * a right-hand column (stacked below the value under 760px).
 */
export function OpsLedger({
  periodLabel,
  cutoffLabel,
  lines,
}: {
  periodLabel: string;
  cutoffLabel: string;
  lines: OpsLedgerLine[];
}) {
  return (
    <section
      aria-label="Operations ledger"
      className="border-b border-[#9f9689] border-t-[3px] border-t-[#c05e19] bg-[#fffdf8]"
    >
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-dashed border-[#b7ac9d] px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[#756f65] sm:px-5 sm:text-[8px]">
        <span>Operations ledger · {periodLabel}</span>
        {/* nowrap + flex-wrap on the row: the cut-off phrase moves to its
            own line whole instead of breaking mid-phrase ("2:00 / PM"). */}
        <span className="whitespace-nowrap">{cutoffLabel}</span>
      </div>
      {lines.map((line) => (
        <Link
          key={line.label}
          href={line.href}
          className={cn(
            "grid min-h-11 w-full grid-cols-[auto_1fr_auto] items-baseline gap-x-2.5 gap-y-1 border-b border-dashed border-[#c8bdae] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[#f7eddf] active:bg-[#ecd9bf] min-[760px]:grid-cols-[auto_1fr_auto_minmax(180px,0.45fr)] min-[760px]:gap-x-2.5 sm:px-5",
            line.exception && "text-[#a95412]",
          )}
        >
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.06em] sm:text-[9px]">
            {line.label}
          </span>
          <i aria-hidden className="border-b border-dotted border-[#9f9689]" />
          <strong
            className={cn(
              "tnum font-mono text-[18px] font-semibold",
              line.exception ? "text-[#a95412]" : "text-foreground",
            )}
          >
            {line.exception && (
              <span aria-hidden className="mr-1 text-[10px]">
                !{" "}
              </span>
            )}
            {line.value}
          </strong>
          <small
            className={cn(
              "col-span-full text-[10px] min-[760px]:col-span-1 sm:text-[8px]",
              line.exception ? "text-[#a95412]" : "text-[#756f65]",
            )}
          >
            {line.note}
          </small>
        </Link>
      ))}
    </section>
  );
}
