type Props = {
  shipped: number;
  ready: number;
  packing: number;
  toPick: number;
};

/** Day pipeline bar (Main.html): shipped = paid, ready = ink, packing =
 *  slate, to pick = hatched frame. role="img" with the numbers in the label. */
export function PipelineBar({ shipped, ready, packing, toPick }: Props) {
  const total = shipped + ready + packing + toPick;
  return (
    <div
      className="pipeline"
      role="img"
      aria-label={`${total} orders today: ${shipped} shipped, ${ready} ready to ship, ${packing} packing, ${toPick} to pick`}
    >
      <i className="seg-shipped" style={{ flex: shipped }} />
      <i className="seg-ready" style={{ flex: ready }} />
      <i className="seg-packing" style={{ flex: packing }} />
      <i className="seg-topick" style={{ flex: toPick }} />
    </div>
  );
}
