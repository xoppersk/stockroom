"use client";

import { useState } from "react";

type Props = {
  name: string;
  /** Product colour — a literal swatch value, not a design token. */
  color: string;
  selected?: boolean;
  soldOut?: boolean;
  onSelect?: () => void;
};

/** §7 Swatch: 44px colour square with offset outline, name below.
 *  Selected: 2px ink outline + aria-pressed. Sold-out stays visible with a
 *  struck name. Uncontrolled when no onSelect is given. */
export function Swatch({ name, color, selected, soldOut, onSelect }: Props) {
  const [internal, setInternal] = useState(selected ?? false);
  const pressed = onSelect ? (selected ?? false) : internal;
  return (
    <button
      type="button"
      className="sw"
      aria-pressed={pressed}
      onClick={() => {
        if (onSelect) onSelect();
        else setInternal((v) => !v);
      }}
    >
      <i style={{ background: color }} aria-hidden="true" />
      <span className={soldOut ? "sold" : undefined}>{name}</span>
    </button>
  );
}
