import "@/styles/console-ops.css";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ops-root">{children}</div>;
}
