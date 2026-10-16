import type { ReactNode } from "react";

export type StampTone = "paid" | "tape" | "problem" | "ink" | "slate" | "muted";

type Props = {
  tone?: StampTone;
  dashed?: boolean;
  children: ReactNode;
};

/** §7 Stamp: status in words, 1.5px outline in its colour, never filled.
 *  Muted is dashed by default ("not started"). */
export function Stamp({ tone = "ink", dashed, children }: Props) {
  const isDashed = dashed ?? tone === "muted";
  return (
    <span className={`stamp ${tone}${isDashed && tone !== "muted" ? " dashed" : ""}`}>
      {children}
    </span>
  );
}
