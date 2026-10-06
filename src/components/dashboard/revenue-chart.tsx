import { formatCompactMoney } from "@/lib/money";

/**
 * Revenue area chart — hand-rolled SVG, no chart library. One series
 * (revenue per day), accent fill, muted gridlines with compact labels.
 */
export function RevenueChart({
  days,
  values,
}: {
  days: string[];
  values: number[];
}) {
  const width = 720;
  const height = 220;
  const padLeft = 48;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const max = Math.max(...values, 1);
  const niceMax = max * 1.1;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + innerH - (v / niceMax) * innerH;
    return { x, y };
  });
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${(padLeft + innerW).toFixed(1)},${(padTop + innerH).toFixed(1)} L${padLeft},${(padTop + innerH).toFixed(1)} Z`;

  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = padTop + innerH - f * innerH;
    return { y, label: formatCompactMoney(niceMax * f) };
  });

  const tickEvery = Math.max(1, Math.ceil(days.length / 6));
  const ticks = days
    .map((day, i) => ({ day, i }))
    .filter(({ i }) => i % tickEvery === 0);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[560px] w-full"
        role="img"
        aria-label={`Revenue over the last ${days.length} days`}
      >
        <defs>
          <linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D97706" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#D97706" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {gridlines.map((g) => (
          <g key={g.label}>
            <line x1={padLeft} y1={g.y} x2={width - padRight} y2={g.y} stroke="#E7E2DC" strokeWidth={1} />
            <text x={padLeft - 8} y={g.y + 4} textAnchor="end" fontSize={11} fill="#78716C" className="tabular-nums">
              {g.label}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#revenue-area)" />
        <path d={line} fill="none" stroke="#D97706" strokeWidth={2} strokeLinejoin="round" />
        {ticks.map(({ day, i }) => (
          <text
            key={day}
            x={padLeft + i * stepX}
            y={height - 8}
            textAnchor="middle"
            fontSize={11}
            fill="#78716C"
          >
            {new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ))}
      </svg>
    </div>
  );
}
