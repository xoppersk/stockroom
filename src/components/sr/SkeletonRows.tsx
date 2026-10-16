type Props = {
  rows?: number;
  label?: string;
};

/** §7 Skeleton: --skeleton blocks in the real exception-row grid (.sk:
 *  132px / 1fr / 110px, from SysLoading), no shimmer, aria-busy, and a
 *  role="status" line. Never fake numbers. */
export function SkeletonRows({ rows = 3, label = "Loading today’s orders and stock…" }: Props) {
  return (
    <div aria-busy="true">
      <span role="status" className="sr-only">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk" key={i} aria-hidden="true">
          <span style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="skel" style={{ width: 70, height: 14 }} />
            <span className="skel" style={{ width: 96, height: 22, opacity: 0.7 }} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span className="skel" style={{ width: "72%", height: 14 }} />
            <span className="skel" style={{ width: "50%", height: 11, opacity: 0.7 }} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="skel" style={{ height: 34 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({
  width,
  height,
  opacity,
}: {
  width?: number | string;
  height: number;
  opacity?: number;
}) {
  return (
    <span
      className="skel"
      aria-hidden="true"
      style={{ width, height, opacity }}
    />
  );
}
