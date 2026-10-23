/* Admin console gate (defence in depth): the console NEVER renders for a
   signed-out visitor or a signed-in account with no staff role.
   Middleware guarantees a session for /admin/*; this gate re-checks the
   session server-side and the role via public.current_role() — the
   SECURITY DEFINER lookup over public.user_roles — before the shell
   renders. Role-less users are bounced to /admin/login?denied=1.
   The check reads cookies (runtime data), so it runs in an async child
   behind Suspense per Cache Components.

   W-ORDERS rewire: once the gate passes, the gate ALSO fetches the real
   actor (profiles + current_role(), via the console data layer) and the
   live console counts (held orders, low-stock SKUs) and passes them to
   ConsoleShell → AppBar as props. The shell no longer reads the fixture
   store for identity or counts. A data-layer failure degrades to a
   nameless actor + zero counts rather than taking the console down —
   the gate itself (session + role) has already passed by then. */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { getConsoleActor, getConsoleCounts } from "@/lib/shop/admin";
import ConsoleShell from "./ConsoleShell";
import "@/styles/console.css";

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: role } = await supabase.rpc("current_role");
  if (typeof role !== "string" || role.length === 0) {
    redirect("/admin/login?denied=1");
  }

  let actor: Awaited<ReturnType<typeof getConsoleActor>> | null = null;
  let counts = { heldOrders: 0, lowStockSkus: 0 };
  try {
    actor = await getConsoleActor();
  } catch {
    actor = null;
  }
  try {
    counts = await getConsoleCounts();
  } catch {
    counts = { heldOrders: 0, lowStockSkus: 0 };
  }

  return (
    <ConsoleShell actor={actor} counts={counts}>
      {children}
    </ConsoleShell>
  );
}
