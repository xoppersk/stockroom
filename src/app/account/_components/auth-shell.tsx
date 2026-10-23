/* Presentational shell shared by the customer auth pages — v2 storefront
   language: white panel on the grey ground, Archivo display heading, the
   checkout form classes (.f / .in / .sbtn) so the pages read as native
   storefront screens. No hooks — safe in Server and Client Components. */
import type { ReactNode } from "react";

export function AuthPanel({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "56px 0 80px" }}>
      <div className="panel" style={{ padding: "30px 30px 28px" }}>
        <h1
          style={{
            margin: 0,
            font: "800 34px/1.02 var(--font-sans)",
            fontStretch: "72%",
            textTransform: "uppercase",
          }}
        >
          {title}
        </h1>
        {sub ? (
          <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
            {sub}
          </p>
        ) : null}
        <div style={{ marginTop: 24 }}>{children}</div>
      </div>
      {footer ? (
        <p className="terms-line" style={{ marginTop: 18 }}>
          {footer}
        </p>
      ) : null}
    </div>
  );
}

export function AuthAlert({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-m)",
        fontSize: 14,
        lineHeight: 1.5,
        background: tone === "error" ? "#fef2f2" : "#f0fdf4",
        boxShadow: `inset 0 0 0 1px ${tone === "error" ? "var(--problem)" : "var(--paid)"}`,
        color: "var(--store-ink)",
      }}
    >
      {children}
    </div>
  );
}
