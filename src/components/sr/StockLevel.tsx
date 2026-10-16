import { Stamp, type StampTone } from "./Stamp";

type Props = {
  name: string;
  sku: string;
  /** Available units (on shelf − committed). Bar + count read against reorder. */
  available: number;
  reorder: number;
  stampTone: StampTone;
  stampLabel: string;
};

/** §7 StockLevel: name + SKU, on-hand vs reorder bar, "3 /12" count, stamp.
 *  Bar: paid at/above reorder, tape below, empty track at zero; count turns
 *  problem at zero. */
export function StockLevel({ name, sku, available, reorder, stampTone, stampLabel }: Props) {
  const pct = reorder > 0 ? Math.min(100, Math.max(0, (available / reorder) * 100)) : 0;
  const fill =
    available <= 0 ? "transparent" : available >= reorder ? "var(--paid)" : "var(--tape)";
  return (
    <div className="stock-level">
      <span className="sl-name">
        <b>{name}</b>
        <span className="sl-bar">
          <code>{sku}</code>
          <span className="trk" aria-hidden="true">
            <i style={{ width: `${pct}%`, background: fill }} />
          </span>
        </span>
      </span>
      <span className={`sl-count${available <= 0 ? " zero" : ""}`}>
        {available}
        <small> /{reorder}</small>
      </span>
      <span>
        <Stamp tone={stampTone}>{stampLabel}</Stamp>
      </span>
    </div>
  );
}
