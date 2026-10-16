import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  caption?: string;
  value: ReactNode;
  tone?: "ink" | "tape" | "problem";
  href?: string;
};

/** §7 LedgerLine: label, dotted leader, mono/figure value right.
 *  Optional caption under the label. A ledger is one panel of these lines. */
export function LedgerLine({ label, caption, value, tone = "ink", href }: Props) {
  const inner = (
    <>
      <span>
        {label}
        {caption ? <small>{caption}</small> : null}
      </span>
      <i className="dots" aria-hidden="true" />
      <b className={`fig${tone !== "ink" ? ` ${tone}` : ""}`}>{value}</b>
    </>
  );
  if (href) {
    return (
      <a className="ledger-line" href={href}>
        {inner}
      </a>
    );
  }
  return <div className="ledger-line">{inner}</div>;
}
