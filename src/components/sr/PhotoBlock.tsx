type Props = {
  /** Short subject, e.g. "Linen apron, Charcoal, on the workshop peg".
   *  Rendered as the caption "Photo · …" and the aria-label (screens pattern). */
  label: string;
  /** Flat placeholder colour (a product/photo value, not a token). */
  color: string;
  dark?: boolean;
  height?: number;
  minHeight?: number;
};

/** §6 Photos: flat colour placeholder blocks with a "Photo · …" label until
 *  real photography exists. role="img" + aria-label. */
export function PhotoBlock({ label, color, dark, height, minHeight }: Props) {
  const text = label.startsWith("Photo") ? label : `Photo · ${label}`;
  return (
    <div
      className="img"
      role="img"
      aria-label={`Photo placeholder: ${label}`}
      style={{ background: color, height, minHeight }}
    >
      <span className={`cap${dark ? " d" : ""}`}>{text}</span>
    </div>
  );
}
