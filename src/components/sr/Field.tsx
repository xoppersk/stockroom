import type { ReactNode } from "react";

type Props = {
  label: string;
  help?: string;
  htmlFor?: string;
  /** When set, the row is in the unsaved state: tape border + focus-tape ring
   *  on the control and "Changed from {unsavedFrom} · not saved" in tape-ink. */
  unsavedFrom?: string;
  /** Error message; rendered under the control. The consumer sets
   *  aria-invalid + aria-describedby={errorId} on the control itself. */
  error?: string;
  errorId?: string;
  children: ReactNode;
};

/** §7 Field: settings row — 200px label (+ muted helper) left, control right,
 *  rows separated by --rule. */
export function Field({ label, help, htmlFor, unsavedFrom, error, errorId, children }: Props) {
  const cls = `fr${unsavedFrom ? " unsaved" : ""}${error ? " error" : ""}`;
  return (
    <div className={cls}>
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          {label}
          {help ? <small>{help}</small> : null}
        </label>
      ) : (
        <span className="lb">
          {label}
          {help ? <small>{help}</small> : null}
        </span>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {children}
        {unsavedFrom ? (
          <span className="field-note">Changed from {unsavedFrom} · not saved</span>
        ) : null}
        {error ? (
          <span className="field-error" id={errorId} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
