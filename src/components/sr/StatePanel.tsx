import type { ReactNode } from "react";
import { Stamp, type StampTone } from "./Stamp";

type Props = {
  stampTone: StampTone;
  stampLabel: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Permission stops render as an alertdialog (§7/StatePanel README). */
  dialog?: boolean;
  labelledBy?: string;
};

/** §7 StatePanel: stamp naming the state, state-title headline, a 15px
 *  paragraph saying what is safe, one tape action then secondary actions. */
export function StatePanel({ stampTone, stampLabel, title, children, actions, dialog, labelledBy }: Props) {
  return (
    <section
      className="panel state-panel"
      role={dialog ? "alertdialog" : undefined}
      aria-modal={dialog ? true : undefined}
      aria-labelledby={labelledBy}
    >
      <Stamp tone={stampTone}>{stampLabel}</Stamp>
      <h2 className="state-title" id={labelledBy}>
        {title}
      </h2>
      <div className="state-body">{children}</div>
      {actions ? <div className="state-actions">{actions}</div> : null}
    </section>
  );
}
