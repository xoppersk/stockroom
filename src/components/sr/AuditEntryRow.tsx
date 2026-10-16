import type { ReactNode } from "react";
import { Stamp, type StampTone } from "./Stamp";

export function AuditDayHeader({ children }: { children: ReactNode }) {
  return <div className="day">{children}</div>;
}

type Props = {
  time: string;
  who: string;
  system?: boolean;
  children: ReactNode;
  kindLabel: string;
  kindTone: StampTone;
  money?: string;
  moneyOut?: boolean;
};

/** §7 AuditEntry: time (mono), who, what changed (old struck → new, via
 *  <span className="ch"><s>old</s>→new</span> in children), kind stamp, money
 *  right-aligned mono — problem for money out. Entries are append-only. */
export function AuditEntryRow({ time, who, system, children, kindLabel, kindTone, money, moneyOut }: Props) {
  return (
    <div className="ev">
      <span className="t">{time}</span>
      <span style={system ? { color: "var(--slate)" } : { fontWeight: 700 }}>{who}</span>
      <span>{children}</span>
      <span>
        <Stamp tone={kindTone}>{kindLabel}</Stamp>
      </span>
      <span className={`amt${moneyOut ? " out" : ""}`}>{money ?? ""}</span>
    </div>
  );
}
