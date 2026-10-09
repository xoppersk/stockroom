/** Compact money: 4100 → "$4.1K", 5820 → "$5.8K". */
export function moneyCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `$${k.toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export interface PostingWeek {
  /** "Oct 6" — week-ending label. */
  label: string;
  revenue: number;
  /** The dip week, marked in tape amber. */
  isDip: boolean;
}

/**
 * Revenue posting chart — the Signature UI figure (Flagship UI Designs,
 * stockroomProto). Four weekly postings as a hand-rolled SVG line chart:
 * dashed gridlines, ink line, amber dip marker, mono axis labels, and a
 * plain-spoken takeaway with the source math.
 */
export function RevenuePostingChart({
  weeks,
  monthLabel,
  year,
}: {
  weeks: PostingWeek[];
  monthLabel: string;
  year: number;
}) {
  const w = 600;
  const h = 180;
  const max = Math.max(Math.ceil(Math.max(...weeks.map((x) => x.revenue), 1) / 2000) * 2000, 2000);
  const pts = weeks.map((d, i) => ({
    x: (i * w) / (weeks.length - 1),
    y: h - (d.revenue / max) * (h - 8),
    d,
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const dip = pts.find((p) => p.d.isDip) ?? pts[0]!;
  const ticks = [max, (max * 2) / 3, max / 3, 0];
  const total = weeks.reduce((a, x) => a + x.revenue, 0);

  return (
    <figure aria-label={`Revenue postings: ${weeks.map((x) => `${x.label} ${moneyCompact(x.revenue)}`).join(", ")}`} className="border border-[#b7ac9d] bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h4 className="font-display text-[16px] font-semibold uppercase tracking-[0.02em]">
            Revenue posting · four {monthLabel} periods
          </h4>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            Net revenue · USD · week ending
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#29251f]" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#c05e19]" />
            Low-stock week
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[28px_minmax(0,1fr)] grid-rows-[168px_auto] gap-x-2.5 gap-y-[7px] sm:grid-rows-[194px_auto]">
        <div aria-hidden className="flex flex-col justify-between text-right font-mono text-[9px] text-[#756f65]">
          {ticks.map((t) => (
            <span key={t}>${(t / 1000).toFixed(0)}K</span>
          ))}
        </div>
        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            role="img"
            className="block h-[168px] w-full overflow-visible sm:h-[194px]"
          >
            <g stroke="#b7ac9d" strokeWidth="1" strokeDasharray="3 6">
              {ticks.map((t, i) => (
                <line key={t} x1="0" x2={w} y1={(i * h) / (ticks.length - 1)} y2={(i * h) / (ticks.length - 1)} />
              ))}
            </g>
            <path d={area} fill="#d8d0c1" fillOpacity="0.34" />
            <path d={line} fill="none" stroke="#29251f" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <circle
              cx={dip.x}
              cy={dip.y}
              r="6"
              fill="#c05e19"
              stroke="#fffdf8"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div aria-hidden className="col-start-2 flex justify-between text-center font-mono text-[9px] leading-snug text-muted-foreground">
          {weeks.map((x) => (
            <span key={x.label}>
              {x.label}
              <br />
              {moneyCompact(x.revenue)}
            </span>
          ))}
        </div>
        <div className="col-span-2 text-center text-[9px] text-muted-foreground">
          Week ending · {year}
        </div>
      </div>

      <figcaption className="mt-[15px] border-t border-border pt-3 text-[11px] leading-relaxed">
        <strong className="font-semibold">
          The low-stock period dipped to {moneyCompact(dip.d.revenue)}; four {monthLabel} postings
          still close at {moneyCompact(total)}.
        </strong>
        <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
          {weeks.map((x) => moneyCompact(x.revenue)).join(" + ")} = {moneyCompact(total)}
        </span>
      </figcaption>
    </figure>
  );
}
