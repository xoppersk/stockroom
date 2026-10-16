import ConsoleShell from "./ConsoleShell";
import "@/styles/console.css";

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
