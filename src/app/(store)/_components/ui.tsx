/* Storefront atoms, built to the design-system specs (StoreButton / Swatch /
   PhotoBlock) with the screens' exact values. Local to the storefront
   territory: W-COMP owns src/components/sr/*, whose prop signatures were not
   yet landed when this worker ran — these match the component READMEs so the
   screens render exactly as drawn either way. */
import Link from "next/link";
import type { ReactNode } from "react";

export function ArrowRight({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8h11M9 4l4 4-4 4" />
    </svg>
  );
}
export function ArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#1C1917" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 8H3M7 4 3 8l4 4" />
    </svg>
  );
}
export function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="#A15C00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" /><path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}
export function LockIcon({ size = 16, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/** PhotoBlock: flat colour placeholder, role="img" + "Photo · …" label (§6). */
export function PhotoBlock({
  label, bg, dark = false, capText, className, style,
}: {
  label: string; bg: string; dark?: boolean; capText?: string;
  className?: string; style?: React.CSSProperties;
}) {
  return (
    <span role="img" aria-label={label} className={`img ${className ?? ""}`} style={{ background: bg, ...style }}>
      <span className={`cap${dark ? " d" : ""}`}>{capText ?? "Photo"}</span>
    </span>
  );
}

/** StoreButton: square-ish (4px per screens), store-ink fill, 52px buy height,
    price inside the label; secondary = 1px outline. */
export function StoreButton({
  children, href, variant = "primary", height, style, onClick, disabled, type, ariaLabel,
}: {
  children: ReactNode; href?: string; variant?: "primary" | "outline" | "tape";
  height?: number; style?: React.CSSProperties; onClick?: () => void;
  disabled?: boolean; type?: "button" | "submit"; ariaLabel?: string;
}) {
  const cls = `sbtn${variant === "outline" ? " ol" : ""}${variant === "tape" ? " tape" : ""}`;
  const st = { height, ...style };
  if (href && !disabled) return <Link href={href} className={cls} style={st} aria-label={ariaLabel}>{children}</Link>;
  return (
    <button type={type ?? "button"} className={cls} style={st} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/** Swatch: 46px colour square (screens) with offset outline + name below;
    selected = 2px ink outline + aria-pressed. Sold-out name is struck. */
export function Swatch({
  colour, hex, selected, soldOut = false, onSelect,
}: {
  colour: string; hex: string; selected: boolean; soldOut?: boolean; onSelect: () => void;
}) {
  return (
    <button type="button" className="swatch" aria-pressed={selected} onClick={onSelect}>
      <i style={{ background: hex }} />
      <span className={soldOut ? "soldname" : undefined}>{colour}</span>
    </button>
  );
}

/** Stamp in the storefront's words-before-colour style. */
export function StoreStamp({ tone, children }: { tone: "tape" | "problem" | "slate"; children: ReactNode }) {
  const color = tone === "tape" ? "#A15C00" : tone === "problem" ? "#B91C1C" : "#57534E";
  return <span className="stamp" style={{ color }}>{children}</span>;
}
