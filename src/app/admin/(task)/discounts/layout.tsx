import "@/styles/console-ops.css";

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ops-root">{children}</div>;
}
