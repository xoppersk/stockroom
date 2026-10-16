type Props = {
  roles: string[];
  rows: { capability: string; values: string[] }[];
  caption?: string;
};

/** §7 PermissionMatrix: roles × capabilities answered in words
 *  (Yes / No / View / Up to $100). "Yes" and limits are .y; No/View are .no. */
export function PermissionMatrix({ roles, rows, caption }: Props) {
  const cols = `minmax(0,1fr) repeat(${roles.length}, 136px)`;
  return (
    <div role="table" aria-label={caption ?? "Role permissions"} style={{ minWidth: 620 }}>
      <div role="row" className="pm head" style={{ gridTemplateColumns: cols }}>
        <span role="columnheader" />
        {roles.map((r) => (
          <span role="columnheader" key={r}>
            {r}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div role="row" className="pm" style={{ gridTemplateColumns: cols }} key={row.capability}>
          <span role="cell">{row.capability}</span>
          {row.values.map((v, i) => (
            <span role="cell" key={i} className={v === "Yes" || v.startsWith("Up to") ? "y" : "no"}>
              {v}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
