import type { ReactNode } from "react";
import { Button } from "./Button";
import { Stamp, type StampTone } from "./Stamp";

type Props = {
  id: string;
  idHref?: string;
  stampTone: StampTone;
  stampLabel: string;
  fact: ReactNode;
  reason: ReactNode;
  codes?: ReactNode;
  fixLabel: string;
  onFix?: () => void;
  fixHref?: string;
  openHref?: string;
  highlighted?: boolean;
};

/** §7 ExceptionRow: identity (mono ID + stamp) / facts (fact line, plain
 *  reason saying what is still safe, codes) / actions (tape fix, then Open). */
export function ExceptionRow({
  id,
  idHref,
  stampTone,
  stampLabel,
  fact,
  reason,
  codes,
  fixLabel,
  onFix,
  fixHref,
  openHref,
  highlighted,
}: Props) {
  return (
    <div className={`ex${highlighted ? " hot" : ""}`}>
      <div>
        {idHref ? (
          <a href={idHref} className="mono ex-id">
            {id}
          </a>
        ) : (
          <span className="mono ex-id">{id}</span>
        )}
        <div className="ex-stamp">
          <Stamp tone={stampTone}>{stampLabel}</Stamp>
        </div>
      </div>
      <div>
        <span className="fact">{fact}</span>
        <p>{reason}</p>
        {codes ? <div className="meta">{codes}</div> : null}
      </div>
      <div className="ex-actions">
        <Button variant="tape" href={fixHref} onClick={onFix}>
          {fixLabel}
        </Button>
        {openHref ? <Button href={openHref}>Open</Button> : null}
      </div>
    </div>
  );
}
