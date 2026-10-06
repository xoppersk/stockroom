/**
 * Tiny SVG sparkline — no chart library. Renders a polyline scaled to the
 * data range, with a soft area fill under it.
 */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  stroke = "#D97706",
  id,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  id: string;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={stroke} strokeWidth={1.5} opacity={0.4} />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${id}`;

  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/** "+12.4%" / "−3.1%" delta badge. */
export function DeltaBadge({ percent }: { percent: number | null }) {
  if (percent === null || !Number.isFinite(percent)) {
    return <span className="text-xs text-muted-foreground">no prior data</span>;
  }
  const up = percent >= 0;
  return (
    <span
      className={
        up
          ? "rounded-full bg-[#15803D]/10 px-2 py-0.5 text-xs font-medium text-[#15803D] tabular-nums"
          : "rounded-full bg-[#DC2626]/10 px-2 py-0.5 text-xs font-medium text-[#DC2626] tabular-nums"
      }
    >
      {up ? "+" : "−"}
      {Math.abs(percent).toFixed(1)}%
    </span>
  );
}
