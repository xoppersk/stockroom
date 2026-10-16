import { SHOP_TAGLINE } from "@/lib/config";

/** Cover is NOT a product component: its folder has no README and its
 *  preview.html is the design-system cover art (a 960×288 brand card:
 *  "Stockroom — The order ledger, without the guesswork."). This renders
 *  that card so /dev/components can mirror design-system/index.html. */
export function Cover() {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--ground)",
        padding: "28px",
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 12,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "50%",
          height: 64,
          background: "var(--bar)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 140,
          right: 0,
          width: "50%",
          height: 28,
          background: "var(--tape)",
        }}
      />
      <p
        style={{
          margin: 0,
          font: "800 64px/0.92 var(--font-sans)",
          fontStretch: "75%",
          textTransform: "uppercase",
          color: "var(--ink)",
          position: "relative",
        }}
      >
        {SHOP_TAGLINE}
      </p>
      <p style={{ margin: 0, fontSize: 14, color: "var(--slate)", position: "relative" }}>
        The order ledger, without the guesswork.
      </p>
    </div>
  );
}
