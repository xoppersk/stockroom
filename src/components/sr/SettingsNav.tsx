export type SettingsKey = "store" | "fulfillment" | "payments" | "alerts" | "team" | "audit";

const ITEMS: { key: SettingsKey; label: string; href: string }[] = [
  { key: "store", label: "Store", href: "/admin/settings" },
  { key: "fulfillment", label: "Fulfillment", href: "/admin/settings#fulfillment" },
  { key: "payments", label: "Payments", href: "/admin/settings#payments" },
  { key: "alerts", label: "Alerts", href: "/admin/settings#alerts" },
  { key: "team", label: "Team", href: "/admin/settings/team" },
  { key: "audit", label: "Audit history", href: "/admin/settings/audit" },
];

/** Settings left nav (§6). Current item is filled --ink with white text. */
export function SettingsNav({ current }: { current: string }) {
  return (
    <nav aria-label="Settings" className="panel" style={{ padding: 8 }}>
      <div
        className="cond"
        style={{
          padding: "10px 14px 8px",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Settings
      </div>
      {ITEMS.map((item) => (
        <a
          key={item.key}
          href={item.href}
          className="sn"
          aria-current={current === item.key ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
